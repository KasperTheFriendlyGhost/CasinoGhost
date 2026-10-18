import SwiftUI

struct ChipKind: Identifiable, Equatable {
    let value: Double
    let color: Color
    let edge: Color
    var id: Double { value }

    static let all: [ChipKind] = [
        ChipKind(value: 5, color: Color(hex: 0xC62F2F), edge: Color(hex: 0xF3D7D7)),
        ChipKind(value: 25, color: Color(hex: 0x1F8A4C), edge: Color(hex: 0xD5F0DE)),
        ChipKind(value: 100, color: Color(hex: 0x1C1C1E), edge: Color(hex: 0xE8E8E8)),
        ChipKind(value: 500, color: Color(hex: 0x6B3FA0), edge: Color(hex: 0xE6DBF5)),
        ChipKind(value: 1000, color: Color(hex: 0xC99A2E), edge: Color(hex: 0xFFF1C9)),
    ]

    /// Break an amount into chips, largest first (for drawing stacks).
    static func breakdown(_ amount: Double) -> [ChipKind] {
        var left = amount
        var out: [ChipKind] = []
        for c in all.reversed() {
            while left >= c.value - 1e-9 && out.count < 14 {
                out.append(c)
                left -= c.value
            }
        }
        return out.reversed()
    }

    var label: String {
        value >= 1000 ? "\(Int(value / 1000))K" : "\(Int(value))"
    }
}

/// A casino chip seen from above.
struct ChipView: View {
    let chip: ChipKind
    var size: CGFloat = 44

    var body: some View {
        ZStack {
            Circle().fill(chip.color.gradient)
            // edge spots
            ForEach(0..<6, id: \.self) { i in
                Capsule()
                    .fill(chip.edge)
                    .frame(width: size * 0.12, height: size * 0.2)
                    .offset(y: -size * 0.4)
                    .rotationEffect(.degrees(Double(i) * 60))
            }
            Circle().strokeBorder(chip.edge.opacity(0.85), style: StrokeStyle(lineWidth: size * 0.035, dash: [size * 0.06, size * 0.05]))
                .padding(size * 0.17)
            Text(chip.label)
                .font(.system(size: size * 0.28, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
                .shadow(color: .black.opacity(0.4), radius: 1)
        }
        .frame(width: size, height: size)
        .shadow(color: .black.opacity(0.35), radius: 2, y: 1.5)
    }
}

/// A stack of chips seen at an angle.
struct ChipStack: View {
    let amount: Double
    var size: CGFloat = 34

    var body: some View {
        let chips = ChipKind.breakdown(amount)
        ZStack {
            ForEach(Array(chips.enumerated()), id: \.offset) { i, c in
                ChipView(chip: c, size: size)
                    .scaleEffect(x: 1, y: 0.62)
                    .offset(y: -CGFloat(i) * size * 0.11)
            }
        }
        .frame(width: size, height: size * 0.62 + CGFloat(max(0, chips.count - 1)) * size * 0.11, alignment: .bottom)
        .animation(.spring(response: 0.3, dampingFraction: 0.75), value: chips.count)
    }
}

/// A betting circle printed on the felt.
struct BetSpotView: View {
    let spot: BetSpot
    let amount: Double
    let selected: Bool
    var result: Double? = nil
    var size: CGFloat = 64

    var body: some View {
        let big = spot == .main
        let d = big ? size * 1.18 : size * 0.86
        ZStack {
            Circle()
                .strokeBorder(Theme.print.opacity(selected ? 0.95 : 0.5), style: StrokeStyle(lineWidth: big ? 2.2 : 1.5, dash: big ? [] : [4, 4]))
                .background(Circle().fill(Color.black.opacity(selected ? 0.18 : 0.08)))
                .frame(width: d, height: d)
            if amount > 0 {
                ChipStack(amount: amount, size: d * 0.56)
            } else {
                Text(spot.label)
                    .font(.display(big ? 15 : 12, weight: .bold))
                    .foregroundStyle(Theme.print.opacity(0.75))
            }
        }
        .overlay(alignment: .bottom) {
            if amount > 0 {
                Text(Fmt.money(amount))
                    .font(.data(11, weight: .bold))
                    .foregroundStyle(Theme.ink)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 1)
                    .background(Color.black.opacity(0.5), in: Capsule())
                    .offset(y: 14)
            }
        }
        .overlay(alignment: .top) {
            if let r = result {
                Text(r > 0 ? "+\(Fmt.money(r))" : r < 0 ? "−\(Fmt.money(-r))" : "Push")
                    .font(.data(11, weight: .heavy))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background((r > 0 ? Theme.good : r < 0 ? Theme.bad : Color.gray).gradient, in: Capsule())
                    .offset(y: -12)
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .scaleEffect(selected ? 1.04 : 1)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: selected)
        .accessibilityElement()
        .accessibilityLabel("\(spot.name), \(Fmt.money(amount))")
        .accessibilityAddTraits(.isButton)
    }
}

/// Bankroll on the rail, racked in chips.
struct BankrollRail: View {
    let bankroll: Double

    var body: some View {
        HStack(spacing: 10) {
            HStack(spacing: 2) {
                ForEach(ChipKind.all.prefix(4)) { c in
                    VStack(spacing: -7) {
                        ForEach(0..<4, id: \.self) { _ in
                            Capsule().fill(c.color).frame(width: 15, height: 5)
                                .overlay(Capsule().strokeBorder(c.edge.opacity(0.6), lineWidth: 0.5))
                        }
                    }
                    .rotationEffect(.degrees(90))
                    .frame(width: 24, height: 16)
                }
            }
            VStack(alignment: .leading, spacing: 0) {
                Text("BANKROLL").font(.system(size: 9, weight: .bold)).tracking(1.5).foregroundStyle(Theme.brass)
                Text(Fmt.money(bankroll))
                    .font(.display(22, weight: .heavy))
                    .foregroundStyle(Theme.ink)
                    .contentTransition(.numericText(value: bankroll))
                    .animation(.snappy, value: bankroll)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 6)
        .background(
            Capsule().fill(LinearGradient(colors: [Color(hex: 0x2A1810), Color(hex: 0x1A0F0A)], startPoint: .top, endPoint: .bottom))
        )
        .overlay(Capsule().strokeBorder(Color.white.opacity(0.12), lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}
