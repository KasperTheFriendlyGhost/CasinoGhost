import SwiftUI
import CasinoGhostCore

private struct FrameKey: PreferenceKey {
    static let defaultValue: [String: CGRect] = [:]
    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) {
        value.merge(nextValue(), uniquingKeysWith: { $1 })
    }
}

private extension View {
    func reportFrame(_ name: String) -> some View {
        background(GeometryReader { g in
            Color.clear.preference(key: FrameKey.self, value: [name: g.frame(in: .named("felt"))])
        })
    }
}

/// The felt: the dealer's station, the hands, the betting circles and the bankroll.
struct FeltView: View {
    @Environment(AppModel.self) private var app
    let model: TableModel
    let width: CGFloat

    @State private var frames: [String: CGRect] = [:]

    private var cardWidth: CGFloat { min(92, max(52, width * 0.165)) }
    private var compact: Bool { width < 560 }

    var body: some View {
        let s = model.state
        VStack(spacing: 0) {
            station(s)
                .padding(.horizontal, 12)
                .padding(.top, 10)
            dealerArea(s)
                .padding(.top, compact ? 4 : 10)
            if !model.bots.isEmpty || !s.bots.isEmpty {
                botsRow.padding(.top, 6)
            }
            playerArea(s)
                .padding(.top, 10)
            spots(s)
                .padding(.top, 22)
                .padding(.bottom, 26)
            BankrollRail(bankroll: s.bankroll)
                .padding(.bottom, 12)
        }
        .frame(maxWidth: .infinity)
        .padding(14)
        .background(FeltBackground(rules: app.settings.rules, dim: !model.dealer.isEmpty))
        .overlay(alignment: .topLeading) {
            CornerPlacard(model: model, settings: app.settings)
                .padding(.leading, 26)
                .padding(.top, 24)
        }
        .overlay(alignment: .top) {
            if let m = model.mistake {
                MistakeToast(decision: m, label: app.settings.countLabel) { model.dismissMistake() }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .coordinateSpace(name: "felt")
        .onPreferenceChange(FrameKey.self) { frames = $0 }
        .environment(\.shoeMouth, point(in: "shoe", ShoeView.mouth))
        .environment(\.trayPoint, point(in: "tray", TrayView.mouth))
        .contentShape(Rectangle())
        .onTapGesture {
            guard app.settings.handSignals, model.canAct, model.legal.hit else { return }
            model.act(.hit)
        }
        .gesture(
            DragGesture(minimumDistance: 30).onEnded { v in
                guard app.settings.handSignals, model.canAct, model.legal.stand else { return }
                if abs(v.translation.width) > 70 && abs(v.translation.height) < 60 { model.act(.stand) }
            }
        )
    }

    private func point(in name: String, _ unit: CGPoint) -> CGPoint? {
        guard let f = frames[name] else { return nil }
        return CGPoint(x: f.minX + unit.x * f.width, y: f.minY + unit.y * f.height)
    }

    // MARK: Sections

    private func station(_ s: TableState) -> some View {
        let decks = Int(app.settings.rules.decks)
        return HStack(alignment: .bottom, spacing: 12) {
            Spacer(minLength: compact ? 96 : 120)
            TrayView(inTray: Int(s.inTray), size: Int(s.shoeSize), decks: decks)
                .frame(width: compact ? 50 : 66)
                .reportFrame("tray")
            if !compact {
                DealerRack().frame(width: min(220, width * 0.3))
            } else {
                Spacer(minLength: 4)
            }
            ShoeView(left: model.cardsLeft, size: Int(s.shoeSize), cut: Int(s.cut), decks: decks)
                .frame(width: compact ? 132 : 180)
                .reportFrame("shoe")
                .modifier(ShuffleShake(tick: model.shuffleTick))
        }
    }

    private func dealerArea(_ s: TableState) -> some View {
        VStack(spacing: 6) {
            HandCards(cards: model.dealer, width: cardWidth, collecting: model.collecting)
                .frame(minHeight: cardWidth * 1.45)
            HStack(spacing: 8) {
                if !model.dealer.isEmpty {
                    let t = TableModel.total(model.dealer)
                    TotalPill(total: t.total, soft: t.soft)
                }
                DealerSays(line: model.dealerLine, id: model.dealerLineID)
            }
            .frame(height: 30)
        }
    }

    private var botsRow: some View {
        HStack(alignment: .top) {
            ForEach(Array(model.bots.enumerated()), id: \.offset) { i, hands in
                VStack(spacing: 3) {
                    HStack(spacing: 6) {
                        ForEach(hands) { h in
                            HandCards(cards: h.cards, width: cardWidth * 0.58, collecting: model.collecting)
                        }
                    }
                    if let h = hands.first, !h.cards.isEmpty {
                        let t = TableModel.total(h.cards)
                        Text(t.soft && t.total < 21 ? "Soft \(t.total)" : "\(t.total)")
                            .font(.data(10, weight: .bold))
                            .foregroundStyle(Theme.ink.opacity(0.8))
                    }
                    Text("Player \(i + 1)").font(.system(size: 9, weight: .semibold)).foregroundStyle(Theme.print.opacity(0.6))
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, 12)
    }

    private func playerArea(_ s: TableState) -> some View {
        HStack(alignment: .top, spacing: 14) {
            ForEach(Array(model.hands.enumerated()), id: \.element.id) { i, h in
                let active = s.phase == .player && i == model.activeHand && model.hands.count > 1
                VStack(spacing: 6) {
                    HandCards(cards: h.cards, width: model.hands.count > 2 ? cardWidth * 0.82 : cardWidth, collecting: model.collecting)
                        .padding(4)
                        .background(
                            RoundedRectangle(cornerRadius: 10).strokeBorder(Theme.brass, lineWidth: active ? 2 : 0)
                        )
                    HStack(spacing: 6) {
                        if !h.cards.isEmpty {
                            let t = TableModel.total(h.cards)
                            TotalPill(total: t.total, soft: t.soft, highlight: active)
                        }
                        if model.showOutcome, s.hands.indices.contains(i), let o = s.hands[i].outcome {
                            OutcomeBadge(outcome: o, net: s.hands[i].net)
                        }
                    }
                    .frame(height: 26)
                }
            }
        }
        .frame(minHeight: cardWidth * 1.45 + 40)
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: model.hands.count)
    }

    private func spots(_ s: TableState) -> some View {
        HStack(alignment: .center, spacing: compact ? 10 : 18) {
            ForEach(BetSpot.allCases) { spot in
                BetSpotView(spot: spot, amount: model.stake(spot), selected: model.canBet && model.selectedSpot == spot,
                            result: result(for: spot, s), size: compact ? 58 : 68)
                    .onTapGesture {
                        guard model.canBet else { return }
                        model.selectedSpot = spot
                        Haptics.select()
                    }
                    .onLongPressGesture { model.clear(spot) }
            }
        }
    }

    private func result(for spot: BetSpot, _ s: TableState) -> Double? {
        guard model.showOutcome, s.phase == .settled else { return nil }
        if let bet = spot.sideBet {
            guard let r = s.sideResults.first(where: { $0.bet == bet }) else { return nil }
            return r.net * r.stake
        }
        return s.hands.isEmpty ? nil : s.hands.reduce(0) { $0 + $1.net } + insuranceResult(s)
    }

    private func insuranceResult(_ s: TableState) -> Double {
        guard let ins = s.insurance else { return 0 }
        let bj = s.dealer.count == 2 && s.dealerTotal == 21
        return bj ? ins * 2 : -ins
    }
}

/// A short shake of the shoe when it is shuffled.
private struct ShuffleShake: ViewModifier {
    let tick: Int
    func body(content: Content) -> some View {
        content.keyframeAnimator(initialValue: 0.0, trigger: tick) { view, x in
            view.rotationEffect(.degrees(x))
        } keyframes: { _ in
            KeyframeTrack {
                CubicKeyframe(-3, duration: 0.08)
                CubicKeyframe(3, duration: 0.1)
                CubicKeyframe(-2, duration: 0.1)
                CubicKeyframe(0, duration: 0.12)
            }
        }
    }
}

/// The dealer's chip rack.
struct DealerRack: View {
    var body: some View {
        HStack(spacing: 2) {
            ForEach(Array([0, 0, 2, 2, 1, 1, 0, 3, 3].enumerated()), id: \.offset) { _, k in
                let c = ChipKind.all[k]
                RoundedRectangle(cornerRadius: 3)
                    .fill(LinearGradient(colors: [c.color.opacity(0.9), c.color], startPoint: .top, endPoint: .bottom))
                    .overlay(
                        VStack(spacing: 2) {
                            ForEach(0..<5, id: \.self) { _ in Rectangle().fill(c.edge.opacity(0.35)).frame(height: 1) }
                        }
                    )
                    .frame(height: 16)
            }
        }
        .padding(4)
        .background(RoundedRectangle(cornerRadius: 5).fill(Color.black.opacity(0.55)))
        .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(Color.white.opacity(0.15)))
        .accessibilityHidden(true)
    }
}

/// Limits placard and the pinned count.
struct CornerPlacard: View {
    let model: TableModel
    let settings: AppSettings

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            VStack(spacing: 0) {
                Text("LIMITS").font(.system(size: 8, weight: .heavy)).tracking(1.4).foregroundStyle(Color(hex: 0x6B5A2E))
                Text("\(Fmt.money(settings.table.minBet))–\(Fmt.money(settings.table.maxBet))")
                    .font(.display(15, weight: .heavy)).foregroundStyle(Color(hex: 0x1B1A16))
            }
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(Color(hex: 0xF4EFE2), in: RoundedRectangle(cornerRadius: 5))
            .shadow(color: .black.opacity(0.35), radius: 0, y: 2)
            if settings.pinCount {
                HStack(spacing: 5) {
                    CountChip(label: "RC", value: Fmt.count(model.runningCount))
                    if settings.count.balanced {
                        CountChip(label: "TC", value: settings.trueCount.rounding == .exact ? String(format: "%+.1f", model.count) : Fmt.count(model.count))
                    }
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

private struct CountChip: View {
    let label: String
    let value: String
    var body: some View {
        VStack(spacing: 0) {
            Text(label).font(.system(size: 8, weight: .heavy)).tracking(1.2).foregroundStyle(Color(hex: 0xD6AC52))
            Text(value).font(.data(16, weight: .bold)).foregroundStyle(Theme.ink)
                .contentTransition(.numericText())
                .animation(.snappy, value: value)
        }
        .frame(minWidth: 34)
        .padding(.horizontal, 6).padding(.vertical, 3)
        .background(Color.black.opacity(0.55), in: RoundedRectangle(cornerRadius: 6))
    }
}

/// The dealer's nameplate and what she says.
struct DealerSays: View {
    let line: String
    let id: Int

    var body: some View {
        HStack(spacing: 6) {
            Text("AVA")
                .font(.system(size: 10, weight: .heavy)).tracking(1.5)
                .foregroundStyle(Theme.brass)
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(Color.black.opacity(0.45), in: Capsule())
                .overlay(Capsule().strokeBorder(Theme.brass.opacity(0.5)))
            Text(line)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Color(hex: 0x1B1A16))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(Color(hex: 0xFBF7EC), in: Capsule())
                .shadow(color: .black.opacity(0.25), radius: 3, y: 1)
                .id(id)
                .transition(.asymmetric(insertion: .scale(scale: 0.85, anchor: .leading).combined(with: .opacity), removal: .opacity))
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: id)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Dealer: \(line)")
    }
}

/// "Best play was …" after a mistake.
struct MistakeToast: View {
    let decision: DecisionRecord
    let label: String
    var dismiss: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Theme.warn)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(decision.spot): \(decision.best), not \(decision.chosen)")
                    .font(.subheadline.weight(.semibold))
                HStack(spacing: 8) {
                    if let i = decision.index { Text(i).font(.caption.weight(.semibold)).foregroundStyle(Theme.brass) }
                    if decision.evCost > 0 {
                        Text("Costs \(Fmt.pct(decision.evCost, digits: 1, signed: false)) of the bet").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            Spacer(minLength: 0)
            Button(action: dismiss) { Image(systemName: "xmark").font(.caption.weight(.bold)) }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .accessibilityLabel("Dismiss")
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: .black.opacity(0.25), radius: 10, y: 4)
    }
}

/// The felt surface with its printed arcs and the padded rail.
struct FeltBackground: View {
    let rules: GameRules
    var dim = false

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 28, style: .continuous)
        ZStack {
            shape.fill(RadialGradient(colors: [Theme.feltHi, Theme.feltLo], center: UnitPoint(x: 0.5, y: 0.25), startRadius: 10, endRadius: 520))
            Canvas { ctx, size in
                let lines: [(String, CGFloat, CGFloat)] = [
                    ("BLACKJACK PAYS \(rules.bjLabel.replacingOccurrences(of: ":", with: " TO "))", 15, 0.0),
                    (rules.h17 ? "DEALER MUST HIT SOFT 17" : "DEALER MUST STAND ON SOFT 17", 10, 26),
                    ("INSURANCE PAYS 2 TO 1", 10, 46),
                ]
                let center = CGPoint(x: size.width / 2, y: size.height * 0.02)
                let base = size.width * 0.62
                for (text, font, extra) in lines {
                    let radius = base + extra
                    let chars = Array(text)
                    let spacing = font * 0.78 / radius
                    let startAngle = Double.pi / 2 + Double(chars.count - 1) * spacing / 2
                    for (i, ch) in chars.enumerated() {
                        let a = startAngle - Double(i) * spacing
                        let p = CGPoint(x: center.x + radius * cos(a), y: center.y + radius * sin(a))
                        var c = ctx
                        c.translateBy(x: p.x, y: p.y)
                        c.rotate(by: .radians(a - .pi / 2))
                        c.draw(Text(String(ch)).font(.system(size: font, weight: .bold, design: .serif)).foregroundColor(Theme.print), at: .zero)
                    }
                }
            }
            .opacity(dim ? 0.18 : 0.42)
            .animation(.easeInOut(duration: 0.4), value: dim)
            .allowsHitTesting(false)
        }
        .clipShape(shape)
        .overlay(shape.strokeBorder(Color(hex: 0xC9A14E).opacity(0.55), lineWidth: 2).padding(3))
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 36, style: .continuous)
                .fill(LinearGradient(colors: [Theme.railHi, Theme.rail], startPoint: .top, endPoint: .bottom))
                .overlay(
                    RoundedRectangle(cornerRadius: 32, style: .continuous)
                        .strokeBorder(Color.white.opacity(0.15), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                        .padding(4)
                )
                .shadow(color: .black.opacity(0.4), radius: 10, y: 6)
        )
    }
}
