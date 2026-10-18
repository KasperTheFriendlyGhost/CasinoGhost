import SwiftUI
import CasinoGhostCore

/// Angles for a 240° dial, measured clockwise from +x in screen space.
private struct DialScale {
    let min: Double
    let max: Double
    static let start = 150.0
    static let sweep = 240.0

    func degrees(_ v: Double) -> Double {
        let t = ((v - min) / (max - min)).clamped(0, 1)
        return Self.start + Self.sweep * t
    }

    func point(_ v: Double, center: CGPoint, radius: CGFloat) -> CGPoint {
        let a = degrees(v) * .pi / 180
        return CGPoint(x: center.x + radius * CGFloat(cos(a)), y: center.y + radius * CGFloat(sin(a)))
    }

    func arc(from a: Double, to b: Double, center: CGPoint, radius: CGFloat) -> Path {
        var p = Path()
        let steps = 48
        for i in 0...steps {
            let v = a + (b - a) * Double(i) / Double(steps)
            let pt = point(v, center: center, radius: radius)
            if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
        }
        return p
    }
}

extension Double {
    func clamped(_ lo: Double, _ hi: Double) -> Double { Swift.min(hi, Swift.max(lo, self)) }
}

/// The gauge needle; animates smoothly between values.
private struct Needle: Shape {
    var value: Double
    let scale: DialScale

    var animatableData: Double {
        get { value }
        set { value = newValue }
    }

    func path(in rect: CGRect) -> Path {
        let c = CGPoint(x: rect.midX, y: rect.midY)
        let r = min(rect.width, rect.height) / 2
        let a = scale.degrees(value) * .pi / 180
        let tip = CGPoint(x: c.x + r * 0.78 * CGFloat(cos(a)), y: c.y + r * 0.78 * CGFloat(sin(a)))
        let n = CGPoint(x: -CGFloat(sin(a)), y: CGFloat(cos(a)))
        let w: CGFloat = r * 0.035
        let tail = CGPoint(x: c.x - r * 0.12 * CGFloat(cos(a)), y: c.y - r * 0.12 * CGFloat(sin(a)))
        var p = Path()
        p.move(to: tip)
        p.addLine(to: CGPoint(x: c.x + n.x * w, y: c.y + n.y * w))
        p.addLine(to: tail)
        p.addLine(to: CGPoint(x: c.x - n.x * w, y: c.y - n.y * w))
        p.closeSubpath()
        return p
    }
}

/// The band of true edges at this count, animated.
private struct BandArc: Shape {
    var low: Double
    var high: Double
    let scale: DialScale

    var animatableData: AnimatablePair<Double, Double> {
        get { AnimatablePair(low, high) }
        set { low = newValue.first; high = newValue.second }
    }

    func path(in rect: CGRect) -> Path {
        let c = CGPoint(x: rect.midX, y: rect.midY)
        // just outside the coloured ring, like a bracket around the range
        let r = min(rect.width, rect.height) / 2 * 0.985
        return scale.arc(from: low, to: high, center: c, radius: r)
    }
}

/// The player's edge at the current count.
struct EdgeGauge: View {
    /// Expected edge at the count (fraction, e.g. 0.008).
    let edge: Double
    /// 10th–90th percentile of the true edge at this count.
    let band: (low: Double, high: Double)?
    /// Exact edge of the remaining cards, when revealed.
    let exact: Double?
    let countText: String
    /// "TC" or "RC".
    let prefix: String
    /// The whole curve, once the simulation has run, and the count the player sees.
    let profile: EdgeProfile?
    let count: Double
    let breakEven: Double?
    let offTheTop: Double
    let bankroll: Double
    let minBet: Double
    let calibrating: Double?

    private var scale: DialScale {
        DialScale(min: Swift.min(-0.02, offTheTop - 0.005), max: 0.03)
    }

    var body: some View {
        VStack(spacing: 10) {
            dial
                .frame(height: 210)
                .padding(.bottom, 12)
            if let profile {
                EdgeCurveStrip(profile: profile, count: count, prefix: prefix)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
            HStack(spacing: 0) {
                stat("Break-even", breakEven.map { "\(prefix) \(Fmt.count($0))" } ?? "—")
                Divider().frame(height: 28)
                stat("Off the top", Fmt.pct(offTheTop))
                Divider().frame(height: 28)
                if let exact {
                    stat("True edge now", Fmt.pct(exact), color: color(exact))
                } else if let band {
                    stat("Real range", "\(Fmt.pct(band.low, digits: 1)) to \(Fmt.pct(band.high, digits: 1))")
                } else {
                    stat("Kelly bet", kelly)
                }
            }
            if let calibrating {
                VStack(spacing: 4) {
                    ProgressView(value: calibrating).tint(Theme.brass)
                    Text("Simulating 10 million rounds of this game to calibrate the gauge…")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Edge \(Fmt.pct(edge)) at \(countText)")
    }

    private var kelly: String {
        guard edge > 0 else { return "Table min" }
        let k = edge / 1.3 * bankroll
        return Fmt.money(Swift.max(minBet, (k / 5).rounded() * 5))
    }

    private func color(_ e: Double) -> Color {
        e > 0.005 ? Theme.good : e > 0 ? Theme.warn : Theme.bad
    }

    private func stat(_ title: String, _ value: String, color: Color = Theme.fg) -> some View {
        VStack(spacing: 2) {
            Text(title.uppercased()).font(.system(size: 9, weight: .semibold)).tracking(1).foregroundStyle(Theme.muted)
            Text(value).font(.data(14, weight: .bold)).foregroundStyle(color).lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
    }

    private var dial: some View {
        let sc = scale
        return GeometryReader { g in
            let side = Swift.min(g.size.width, g.size.height * 1.3)
            ZStack {
                Canvas { ctx, size in
                    let c = CGPoint(x: size.width / 2, y: size.height / 2)
                    let r = Swift.min(size.width, size.height) / 2
                    // zones
                    let zones: [(Double, Double, Color)] = [
                        (sc.min, 0, Theme.bad), (0, 0.005, Theme.warn), (0.005, sc.max, Theme.good),
                    ]
                    for (a, b, col) in zones {
                        ctx.stroke(sc.arc(from: a, to: b, center: c, radius: r * 0.9), with: .color(col.opacity(0.85)), style: StrokeStyle(lineWidth: r * 0.06, lineCap: .butt))
                    }
                    // ticks every 0.25%, labels every 1%
                    var t = (sc.min * 400).rounded(.up) / 400
                    while t <= sc.max + 1e-9 {
                        let major = abs((t * 100).rounded() - t * 100) < 1e-6
                        let half = abs((t * 200).rounded() - t * 200) < 1e-6
                        let p1 = sc.point(t, center: c, radius: r * 0.82)
                        let p2 = sc.point(t, center: c, radius: r * (major ? 0.72 : half ? 0.76 : 0.79))
                        var tick = Path()
                        tick.move(to: p1)
                        tick.addLine(to: p2)
                        ctx.stroke(tick, with: .color(Theme.fg2.opacity(major ? 0.9 : 0.45)), lineWidth: major ? 1.6 : 0.8)
                        if major {
                            let lp = sc.point(t, center: c, radius: r * 0.6)
                            let label = abs(t) < 1e-9 ? "0" : String(format: "%+.0f", t * 100)
                            ctx.draw(Text(label).font(.system(size: r * 0.085, weight: .semibold, design: .rounded)).foregroundColor(Theme.muted), at: lp)
                        }
                        t += 0.0025
                    }
                }
                if let band {
                    BandArc(low: band.low.clamped(sc.min, sc.max), high: band.high.clamped(sc.min, sc.max), scale: sc)
                        .stroke(Theme.brass.opacity(0.9), style: StrokeStyle(lineWidth: side * 0.022, lineCap: .round))
                        .animation(.spring(response: 0.6, dampingFraction: 0.8), value: band.low)
                }
                if let exact {
                    ExactMarker(value: exact.clamped(sc.min, sc.max), scale: sc)
                        .fill(Theme.info)
                        .animation(.spring(response: 0.6, dampingFraction: 0.75), value: exact)
                }
                Needle(value: edge.clamped(sc.min, sc.max), scale: sc)
                    .fill(LinearGradient(colors: [Theme.brassHi, Theme.brassLo], startPoint: .top, endPoint: .bottom))
                    .shadow(color: .black.opacity(0.35), radius: 2, y: 1)
                    .animation(.spring(response: 0.55, dampingFraction: 0.7), value: edge)
                Circle().fill(Theme.panel).frame(width: side * 0.07, height: side * 0.07)
                    .overlay(Circle().strokeBorder(Theme.brass, lineWidth: 2))
                VStack(spacing: 0) {
                    Text(Fmt.pct(edge))
                        .font(.display(side * 0.15, weight: .heavy))
                        .foregroundStyle(color(edge))
                        .contentTransition(.numericText(value: edge))
                        .animation(.snappy, value: edge)
                    Text("YOUR EDGE AT \(countText)")
                        .font(.system(size: 10, weight: .semibold)).tracking(1)
                        .foregroundStyle(Theme.muted)
                }
                .offset(y: side * 0.2)
            }
            .frame(width: side, height: side)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

/// Small triangle on the outside of the dial at the exact edge.
private struct ExactMarker: Shape {
    var value: Double
    let scale: DialScale
    var animatableData: Double {
        get { value }
        set { value = newValue }
    }

    func path(in rect: CGRect) -> Path {
        let c = CGPoint(x: rect.midX, y: rect.midY)
        let r = min(rect.width, rect.height) / 2
        let a = scale.degrees(value) * .pi / 180
        let dir = CGPoint(x: CGFloat(cos(a)), y: CGFloat(sin(a)))
        let n = CGPoint(x: -dir.y, y: dir.x)
        let tip = CGPoint(x: c.x + dir.x * r * 0.95, y: c.y + dir.y * r * 0.95)
        let baseC = CGPoint(x: c.x + dir.x * r * 1.06, y: c.y + dir.y * r * 1.06)
        let w = r * 0.045
        var p = Path()
        p.move(to: tip)
        p.addLine(to: CGPoint(x: baseC.x + n.x * w, y: baseC.y + n.y * w))
        p.addLine(to: CGPoint(x: baseC.x - n.x * w, y: baseC.y - n.y * w))
        p.closeSubpath()
        return p
    }
}

/// The gauge wired to the table.
struct EdgeGaugeCard: View {
    @Environment(AppModel.self) private var app
    let model: TableModel

    var body: some View {
        let s = app.settings
        let curve = model.edgeCurve
        let count = model.count
        let prefix = s.count.balanced ? "TC" : "RC"
        Panel(title: "Your edge", systemImage: "gauge.with.dots.needle.67percent") {
            EdgeGauge(
                edge: model.estimatedEdge,
                band: curve.flatMap { EdgeMath.band($0, at: count) },
                exact: s.revealExactEdge ? model.exactEdge : nil,
                countText: "\(prefix) \(Fmt.count(count))",
                prefix: prefix,
                profile: model.edgeProfile,
                count: count,
                breakEven: curve.map(\.breakEven).flatMap { $0.isFinite ? $0 : nil },
                offTheTop: model.state.baseEdge,
                bankroll: model.state.bankroll,
                minBet: s.table.minBet,
                calibrating: app.analysis.edgeProgress
            )
            Text(explanation(curve))
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func explanation(_ curve: EdgeCurve?) -> String {
        guard curve != nil else {
            return "Estimated from the house edge and the count until the simulation finishes."
        }
        var s = "Ten million simulated rounds of these exact rules, penetration, count and index plays, smoothed into one curve."
        s += " The band shows where the true edge of real shoes falls at each count (10th–90th percentile): the count is an estimate, and this is how far it can be off."
        if app.settings.revealExactEdge { s += " The blue marker is the exact edge of the cards actually left." }
        return s
    }
}
