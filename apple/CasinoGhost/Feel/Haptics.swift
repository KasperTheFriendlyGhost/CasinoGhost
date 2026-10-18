import UIKit

/// Taptic feedback for chips, cards, decisions and results.
@MainActor
enum Haptics {
    static var enabled = true

    private static let light = UIImpactFeedbackGenerator(style: .light)
    private static let soft = UIImpactFeedbackGenerator(style: .soft)
    private static let rigid = UIImpactFeedbackGenerator(style: .rigid)
    private static let heavy = UIImpactFeedbackGenerator(style: .heavy)
    private static let selection = UISelectionFeedbackGenerator()
    private static let notification = UINotificationFeedbackGenerator()

    /// A card landing on the felt.
    static func card() {
        guard enabled else { return }
        soft.impactOccurred(intensity: 0.55)
    }
    /// A chip placed or removed.
    static func chip() {
        guard enabled else { return }
        rigid.impactOccurred(intensity: 0.7)
    }
    static func tap() {
        guard enabled else { return }
        light.impactOccurred()
    }
    static func select() {
        guard enabled else { return }
        selection.selectionChanged()
    }
    static func shuffle() {
        guard enabled else { return }
        heavy.impactOccurred(intensity: 0.8)
    }
    static func success() {
        guard enabled else { return }
        notification.notificationOccurred(.success)
    }
    static func warning() {
        guard enabled else { return }
        notification.notificationOccurred(.warning)
    }
    static func error() {
        guard enabled else { return }
        notification.notificationOccurred(.error)
    }
}
