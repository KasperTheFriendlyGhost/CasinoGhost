import SwiftUI
import CasinoGhostCore

/// The fitted edge curve, sampled once per curve for drawing.
struct EdgeProfile: Equatable {
    struct Point: Equatable {
        let count: Double
        let edge: Double
        let low: Double?
        let high: Double?
    }

    struct Bar: Equatable {
        let count: Double
        let freq: Double
    }

    let points: [Point]
    let bars: [Bar]
    let xMin: Double
    let xMax: Double
    let yMin: Double
    let yMax: Double
    let breakEven: Double?

    /// Counts dealt at least 0.2% of the time make up the drawn range.
    init?(curve: EdgeCurve) {
        let common = curve.rows.filter { $0.freq >= 0.002 }
        guard let first = common.first, let last = common.last, last.count > first.count else { return nil }
        // rows hold whole counts, or counts from c to c + 1 when the count isn't rounded
        xMin = Double(first.count) + curve.shift - 0.5
        xMax = Double(last.count) + curve.shift + 0.5
        let steps = 96
        let (lo, hi) = (xMin, xMax)
        points = (0...steps).map { i in
            let x = lo + (hi - lo) * Double(i) / Double(steps)
            let band = curveBand(curve: curve, count: x)
            return Point(count: x, edge: curveEdge(curve: curve, count: x), low: band?.low, high: band?.high)
        }
        bars = common.map { Bar(count: Double($0.count) + curve.shift, freq: $0.freq) }
        let lows = points.map { $0.low ?? $0.edge }
        let highs = points.map { $0.high ?? $0.edge }
        let a = Swift.min(0, lows.min() ?? 0)
        let b = Swift.max(0.005, highs.max() ?? 0)
        let pad = (b - a) * 0.08
        yMin = Swift.max(-0.06, a - pad)
        yMax = Swift.min(0.09, b + pad)
        breakEven = curve.breakEven.isFinite ? curve.breakEven : nil
    }

    /// Edge at a count, interpolated between the sampled points.
    func edge(at x: Double) -> Double {
        guard points.count > 1 else { return points.first?.edge ?? 0 }
        let t = ((x - xMin) / (xMax - xMin)).clamped(0, 1) * Double(points.count - 1)
        let i = Swift.min(Int(t), points.count - 2)
        let f = t - Double(i)
        return points[i].edge + f * (points[i + 1].edge - points[i].edge)
    }
}

/// Maps counts and edges to the plot area of the strip.
private struct StripFrame {
    let profile: EdgeProfile
    let plot: CGRect

    init(_ profile: EdgeProfile, in rect: CGRect) {
        self.profile = profile
        plot = CGRect(x: rect.minX + 34, y: rect.minY + 6, width: rect.width - 40, height: rect.height - 22)
    }

    func x(_ c: Double) -> CGFloat {
        plot.minX + plot.width * CGFloat((c - profile.xMin) / (profile.xMax - profile.xMin))
    }

    func y(_ e: Double) -> CGFloat {
        plot.maxY - plot.height * CGFloat(((e - profile.yMin) / (profile.yMax - profile.yMin)).clamped(0, 1))
    }
}

/// The whole game at a glance: edge by count (fitted curve), the range of true edges of real
/// shoes, how often each count comes up, the break-even count and where the count is now.
struct EdgeCurveStrip: View {
    let profile: EdgeProfile
    let count: Double
    let prefix: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 10) {
                Text("EDGE BY COUNT").font(.system(size: 9, weight: .semibold)).tracking(1).foregroundStyle(Theme.muted)
                Spacer()
                key(Theme.brass.opacity(0.35), "True-edge range")
                key(Theme.fg2.opacity(0.18), "How often")
            }
            ZStack {
                Canvas { ctx, size in draw(&ctx, size) }
                MarkerGuide(count: count.clamped(profile.xMin, profile.xMax), profile: profile)
                    .stroke(Theme.brass.opacity(0.7), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                MarkerDot(count: count.clamped(profile.xMin, profile.xMax), profile: profile)
                    .fill(Theme.brass)
                    .overlay(
                        MarkerDot(count: count.clamped(profile.xMin, profile.xMax), profile: profile)
                            .stroke(Theme.panel, lineWidth: 2)
                    )
                    .shadow(color: .black.opacity(0.25), radius: 2, y: 1)
            }
            .animation(.spring(response: 0.55, dampingFraction: 0.75), value: count)
            .frame(height: 112)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibility)
    }

    private var accessibility: String {
        var s = "Edge by count chart."
        if let be = profile.breakEven { s += " The edge turns positive at \(prefix) \(Fmt.count(be))." }
        s += " Your count is \(prefix) \(Fmt.count(count))."
        return s
    }

    private func key(_ color: Color, _ label: String) -> some View {
        HStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 10, height: 6)
            Text(label).font(.system(size: 9)).foregroundStyle(Theme.muted)
        }
    }

    private func draw(_ ctx: inout GraphicsContext, _ size: CGSize) {
        let f = StripFrame(profile, in: CGRect(origin: .zero, size: size))
        let p = profile
        let label = { (s: String) in Text(s).font(.system(size: 9, weight: .medium, design: .rounded)).foregroundColor(Theme.muted) }

        // how often each count comes up
        let maxFreq = p.bars.map(\.freq).max() ?? 1
        let barW = Swift.max(2, f.x(p.xMin + 0.8) - f.x(p.xMin))
        for b in p.bars {
            let h = f.plot.height * 0.55 * CGFloat(b.freq / maxFreq)
            let r = CGRect(x: f.x(b.count) - barW / 2, y: f.plot.maxY - h, width: barW, height: h)
            ctx.fill(Path(roundedRect: r, cornerRadius: 1.5), with: .color(Theme.fg2.opacity(0.13)))
        }

        // edge grid
        let span = p.yMax - p.yMin
        let step = span > 0.06 ? 0.02 : span > 0.025 ? 0.01 : 0.005
        var e = (p.yMin / step).rounded(.up) * step
        while e <= p.yMax + 1e-9 {
            let y = f.y(e)
            var line = Path()
            line.move(to: CGPoint(x: f.plot.minX, y: y))
            line.addLine(to: CGPoint(x: f.plot.maxX, y: y))
            let zero = abs(e) < 1e-9
            ctx.stroke(line, with: .color(Theme.fg2.opacity(zero ? 0.55 : 0.12)), style: StrokeStyle(lineWidth: zero ? 1 : 0.5, dash: zero ? [] : [2, 3]))
            let text = zero ? "0" : String(format: step < 0.01 ? "%+.1f%%" : "%+.0f%%", e * 100)
            ctx.draw(label(text), at: CGPoint(x: f.plot.minX - 4, y: y), anchor: .trailing)
            e += step
        }

        // count axis
        let xStep = Swift.max(1.0, ((p.xMax - p.xMin) / 7).rounded())
        var c = (p.xMin / xStep).rounded(.up) * xStep
        while c <= p.xMax + 1e-9 {
            ctx.draw(label(Fmt.count(c)), at: CGPoint(x: f.x(c), y: f.plot.maxY + 3), anchor: .top)
            c += xStep
        }

        // the range of true edges at each count
        let banded = p.points.filter { $0.low != nil && $0.high != nil }
        if banded.count > 1 {
            var band = Path()
            band.move(to: CGPoint(x: f.x(banded[0].count), y: f.y(banded[0].high!)))
            for q in banded.dropFirst() { band.addLine(to: CGPoint(x: f.x(q.count), y: f.y(q.high!))) }
            for q in banded.reversed() { band.addLine(to: CGPoint(x: f.x(q.count), y: f.y(q.low!))) }
            band.closeSubpath()
            ctx.fill(band, with: .color(Theme.brass.opacity(0.22)))
        }

        // break-even
        if let be = p.breakEven, be > p.xMin, be < p.xMax {
            let x = f.x(be)
            var line = Path()
            line.move(to: CGPoint(x: x, y: f.plot.minY))
            line.addLine(to: CGPoint(x: x, y: f.plot.maxY))
            ctx.stroke(line, with: .color(Theme.good.opacity(0.6)), style: StrokeStyle(lineWidth: 1, dash: [1, 2.5]))
            let right = be < (p.xMin + p.xMax) / 2
            ctx.draw(
                Text("break-even \(prefix) \(Fmt.count(be))").font(.system(size: 9, weight: .semibold)).foregroundColor(Theme.good),
                at: CGPoint(x: x + (right ? 4 : -4), y: f.plot.minY + 1),
                anchor: right ? .topLeading : .topTrailing
            )
        }

        // the curve, red below zero and green above
        var curve = Path()
        for (i, q) in p.points.enumerated() {
            let pt = CGPoint(x: f.x(q.count), y: f.y(q.edge))
            if i == 0 { curve.move(to: pt) } else { curve.addLine(to: pt) }
        }
        let z = ((f.y(0) - f.plot.minY) / Swift.max(1, f.plot.height)).clamped(0, 1)
        let gradient = Gradient(stops: [
            .init(color: Theme.good, location: 0),
            .init(color: Theme.good, location: z),
            .init(color: Theme.bad, location: z),
            .init(color: Theme.bad, location: 1),
        ])
        ctx.stroke(
            curve,
            with: .linearGradient(gradient, startPoint: CGPoint(x: 0, y: f.plot.minY), endPoint: CGPoint(x: 0, y: f.plot.maxY)),
            style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round)
        )
    }
}

private extension CGFloat {
    func clamped(_ lo: CGFloat, _ hi: CGFloat) -> CGFloat { Swift.min(hi, Swift.max(lo, self)) }
}

/// Dashed line from the count axis up to the curve, animated along the count.
private struct MarkerGuide: Shape {
    var count: Double
    let profile: EdgeProfile

    var animatableData: Double {
        get { count }
        set { count = newValue }
    }

    func path(in rect: CGRect) -> Path {
        let f = StripFrame(profile, in: rect)
        let x = f.x(count)
        var p = Path()
        p.move(to: CGPoint(x: x, y: f.plot.maxY))
        p.addLine(to: CGPoint(x: x, y: f.y(profile.edge(at: count)) + 5))
        return p
    }
}

/// The current count riding on the curve.
private struct MarkerDot: Shape {
    var count: Double
    let profile: EdgeProfile

    var animatableData: Double {
        get { count }
        set { count = newValue }
    }

    func path(in rect: CGRect) -> Path {
        let f = StripFrame(profile, in: rect)
        let c = CGPoint(x: f.x(count), y: f.y(profile.edge(at: count)))
        return Path(ellipseIn: CGRect(x: c.x - 5, y: c.y - 5, width: 10, height: 10))
    }
}
