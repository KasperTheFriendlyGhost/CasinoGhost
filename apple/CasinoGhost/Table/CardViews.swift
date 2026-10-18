import SwiftUI
import CasinoGhostCore

// MARK: - Table geometry shared with the cards

private struct ShoeMouthKey: EnvironmentKey {
    static let defaultValue: CGPoint? = nil
}
private struct TrayPointKey: EnvironmentKey {
    static let defaultValue: CGPoint? = nil
}

extension EnvironmentValues {
    /// Where cards leave the shoe, in the "felt" coordinate space.
    var shoeMouth: CGPoint? {
        get { self[ShoeMouthKey.self] }
        set { self[ShoeMouthKey.self] = newValue }
    }
    /// Where cards are swept to, in the "felt" coordinate space.
    var trayPoint: CGPoint? {
        get { self[TrayPointKey.self] }
        set { self[TrayPointKey.self] = newValue }
    }
}

/// Remembers which cards have finished their deal animation, so a card that moves to another
/// hand (a split) doesn't fly in from the shoe again.
@MainActor
final class LandedCards {
    static let shared = LandedCards()
    private var ids = Set<Int>()
    func contains(_ id: Int) -> Bool { ids.contains(id) }
    func insert(_ id: Int) {
        ids.insert(id)
        if ids.count > 4000 { ids.removeAll() }
    }
}

// MARK: - Card faces

/// A card face or back, drawn from the asset catalog.
struct CardImage: View {
    let card: PlayingCard?
    let faceUp: Bool
    let width: CGFloat

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: width * 0.075, style: .continuous)
        Group {
            if faceUp, let card {
                Image(card.assetName).resizable().interpolation(.high)
            } else {
                Image("Cards/back").resizable().interpolation(.high)
            }
        }
        .aspectRatio(5.0 / 7.0, contentMode: .fit)
        .frame(width: width, height: width * 1.4)
        .background(Color.white, in: shape)
        .clipShape(shape)
        .overlay(shape.strokeBorder(Color.black.opacity(0.12), lineWidth: 0.5))
    }
}

/// A card that turns over in 3D. `angle` 0 = face up, 180 = face down.
struct FlippingCard: View, Animatable {
    var angle: Double
    let card: PlayingCard
    let width: CGFloat

    var animatableData: Double {
        get { angle }
        set { angle = newValue }
    }

    var body: some View {
        CardImage(card: card, faceUp: angle < 90, width: width)
            .scaleEffect(x: angle < 90 ? 1 : -1, y: 1)
            .rotation3DEffect(.degrees(angle), axis: (x: 0, y: 1, z: 0), perspective: 0.45)
            .shadow(color: .black.opacity(0.35), radius: width * 0.04, x: 0, y: width * 0.025)
    }
}

/// A card on the felt: flies in from the shoe when dealt, flips when turned, and sweeps to the
/// discard tray when the round is collected.
struct DealtCard: View {
    let card: DCard
    let width: CGFloat
    var collecting: Bool = false

    @Environment(\.shoeMouth) private var mouth
    @Environment(\.trayPoint) private var tray
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var start: CGSize?
    @State private var landed = false
    @State private var trayOffset: CGSize = .zero

    var body: some View {
        FlippingCard(angle: card.faceUp ? 0 : 180, card: card.card, width: width)
            .offset(currentOffset)
            .rotationEffect(.degrees(landed || start == nil ? 0 : -24))
            .scaleEffect(collecting ? 0.55 : 1)
            .opacity(opacity)
            .background(
                GeometryReader { g in
                    Color.clear.onAppear { place(in: g.frame(in: .named("felt"))) }
                }
            )
            .accessibilityElement()
            .accessibilityLabel(card.faceUp ? card.card.accessibilityName : "Face-down card")
    }

    private var currentOffset: CGSize {
        if collecting { return trayOffset }
        if landed { return .zero }
        return start ?? .zero
    }

    private var opacity: Double {
        if collecting { return 0 }
        if start == nil && !landed { return 0 }
        return 1
    }

    private func place(in frame: CGRect) {
        let center = CGPoint(x: frame.midX, y: frame.midY)
        if let tray {
            trayOffset = CGSize(width: tray.x - center.x, height: tray.y - center.y)
        }
        if LandedCards.shared.contains(card.id) || reduceMotion || mouth == nil {
            landed = true
            start = .zero
            LandedCards.shared.insert(card.id)
            return
        }
        let m = mouth ?? center
        start = CGSize(width: m.x - center.x, height: m.y - center.y)
        DispatchQueue.main.async {
            withAnimation(.spring(response: 0.42, dampingFraction: 0.82)) { landed = true }
            LandedCards.shared.insert(card.id)
        }
    }
}

/// A hand of overlapping cards.
struct HandCards: View {
    let cards: [DCard]
    let width: CGFloat
    var collecting = false

    var body: some View {
        let step = width * 0.36
        ZStack(alignment: .leading) {
            ForEach(Array(cards.enumerated()), id: \.element.id) { i, c in
                DealtCard(card: c, width: width, collecting: collecting)
                    .offset(x: CGFloat(i) * step, y: CGFloat(i) * -width * 0.04)
                    .zIndex(Double(i))
            }
        }
        .frame(width: width + step * CGFloat(max(0, cards.count - 1)), height: width * 1.4 + width * 0.04 * CGFloat(max(0, cards.count - 1)), alignment: .bottomLeading)
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: cards.count)
    }
}

/// Total shown under a hand.
struct TotalPill: View {
    let total: Int
    let soft: Bool
    var highlight = false

    var body: some View {
        Text(soft && total < 21 ? "Soft \(total)" : "\(total)")
            .font(.display(17, weight: .bold))
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 10)
            .padding(.vertical, 3)
            .background(Color.black.opacity(0.55), in: Capsule())
            .overlay(Capsule().strokeBorder(highlight ? Theme.brass : Color.black.opacity(0.4), lineWidth: highlight ? 1.5 : 1))
            .contentTransition(.numericText())
            .animation(.snappy, value: total)
    }
}

/// Result badge after a round.
struct OutcomeBadge: View {
    let outcome: Outcome
    let net: Double

    var body: some View {
        let (text, color): (String, Color) = {
            switch outcome {
            case .blackjack: return ("Blackjack", Theme.brass)
            case .win: return ("Win", Theme.good)
            case .push: return ("Push", Color.gray)
            case .lose: return ("Lose", Theme.bad)
            case .bust: return ("Bust", Theme.bad)
            case .surrender: return ("Surrender", Color.gray)
            }
        }()
        HStack(spacing: 4) {
            Text(text).font(.caption.weight(.heavy))
            if net != 0 { Text(Fmt.signedMoney(net)).font(.data(11)) }
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(color.gradient, in: Capsule())
        .shadow(color: .black.opacity(0.3), radius: 3, y: 1)
        .transition(.scale(scale: 0.6).combined(with: .opacity))
    }
}
