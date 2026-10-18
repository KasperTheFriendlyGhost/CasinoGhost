import SwiftUI
import UIKit

extension Color {
    /// A colour that adapts to light and dark appearance.
    init(light: UInt32, dark: UInt32) {
        self.init(UIColor { trait in
            let v = trait.userInterfaceStyle == .dark ? dark : light
            return UIColor(
                red: CGFloat((v >> 16) & 0xFF) / 255,
                green: CGFloat((v >> 8) & 0xFF) / 255,
                blue: CGFloat(v & 0xFF) / 255,
                alpha: 1)
        })
    }

    init(hex: UInt32, opacity: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: opacity)
    }
}

/// The CasinoGhost palette.
enum Theme {
    static let background = Color(light: 0xF4F1EA, dark: 0x0E1210)
    static let panel = Color(light: 0xFFFDF8, dark: 0x171C19)
    static let panel2 = Color(light: 0xF2EEE4, dark: 0x1F2521)
    static let line = Color(light: 0xE2DDD0, dark: 0x2A322D)
    static let fg = Color(light: 0x1B1D1B, dark: 0xEEF0EC)
    static let fg2 = Color(light: 0x4A504C, dark: 0xA9B3AD)
    static let muted = Color(light: 0x7A7F7B, dark: 0x7D8781)
    static let brass = Color(light: 0x9A7426, dark: 0xD6AC52)
    static let brassHi = Color(hex: 0xF2D88E)
    static let brassLo = Color(hex: 0xB0862F)
    static let good = Color(light: 0x23864C, dark: 0x3DBE74)
    static let bad = Color(light: 0xC23B36, dark: 0xE5544F)
    static let warn = Color(light: 0xB7791F, dark: 0xE2A33B)
    static let info = Color(light: 0x2F6FB0, dark: 0x5B9BE0)

    // The table
    static let feltHi = Color(hex: 0x1F7A57)
    static let feltLo = Color(hex: 0x0D3D2C)
    static let rail = Color(hex: 0x3B2416)
    static let railHi = Color(hex: 0x5A3822)
    static let print = Color(hex: 0xE9DDB4)
    static let ink = Color(hex: 0xF6EEDB)

    static let corner: CGFloat = 18
}

extension Font {
    /// Condensed display face for headings and big numbers.
    static func display(_ size: CGFloat, weight: Font.Weight = .heavy) -> Font {
        .system(size: size, weight: weight, design: .default).width(.compressed)
    }
    /// Tabular numbers for data.
    static func data(_ size: CGFloat, weight: Font.Weight = .semibold) -> Font {
        .system(size: size, weight: weight, design: .rounded).monospacedDigit()
    }
}

/// Rounded panel used for cards and widgets.
struct Panel<Content: View>: View {
    var title: String?
    var systemImage: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let title {
                HStack(spacing: 6) {
                    if let systemImage { Image(systemName: systemImage).foregroundStyle(Theme.brass) }
                    Text(title.uppercased()).font(.caption.weight(.semibold)).tracking(1.2).foregroundStyle(Theme.muted)
                }
            }
            content
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: Theme.corner, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.corner, style: .continuous).strokeBorder(Theme.line, lineWidth: 1))
    }
}

/// Gold primary button.
struct BrassButtonStyle: ButtonStyle {
    var big = false
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(big ? .headline.weight(.bold) : .subheadline.weight(.semibold))
            .foregroundStyle(Color(hex: 0x2A1E06))
            .padding(.horizontal, big ? 22 : 14)
            .padding(.vertical, big ? 13 : 9)
            .background(
                LinearGradient(colors: [Theme.brassHi, Theme.brassLo], startPoint: .top, endPoint: .bottom),
                in: Capsule())
            .overlay(Capsule().strokeBorder(Color.white.opacity(0.35), lineWidth: 1))
            .shadow(color: .black.opacity(configuration.isPressed ? 0.1 : 0.25), radius: configuration.isPressed ? 2 : 6, y: configuration.isPressed ? 1 : 3)
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .opacity(enabled ? 1 : 0.45)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

/// Outlined secondary button.
struct GhostButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Theme.fg)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(Theme.panel2.opacity(configuration.isPressed ? 1 : 0.6), in: Capsule())
            .overlay(Capsule().strokeBorder(Theme.line, lineWidth: 1))
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .opacity(enabled ? 1 : 0.4)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}
