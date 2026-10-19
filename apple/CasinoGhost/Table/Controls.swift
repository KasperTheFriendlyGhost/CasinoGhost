import SwiftUI
import CasinoGhostCore

/// The bar under the table: chips and Deal between rounds, actions during a hand.
struct ControlsBar: View {
    @Environment(AppModel.self) private var app
    let model: TableModel

    var body: some View {
        VStack(spacing: 8) {
            switch model.phase {
            case .insurance:
                insurance
            case .player:
                actions
            case .betting, .settled:
                betting
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.bar)
        .overlay(alignment: .top) { Divider() }
        .disabled(model.busy)
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: model.phase)
    }

    private var betting: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                ForEach(ChipKind.all.prefix(4)) { c in
                    Button {
                        model.addChip(c.value)
                    } label: {
                        ChipView(chip: c, size: 46)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Add \(Fmt.money(c.value)) to \(model.selectedSpot.name)")
                    .contextMenu {
                        Button("Remove \(Fmt.money(c.value))", systemImage: "minus.circle") { model.removeChip(c.value) }
                        Button("Clear \(model.selectedSpot.name)", systemImage: "xmark.circle") { model.clear(model.selectedSpot) }
                    }
                }
                Spacer(minLength: 4)
                Button {
                    model.deal()
                } label: {
                    Text(model.phase == .settled ? "Deal again" : "Deal").frame(minWidth: 70)
                }
                .buttonStyle(BrassButtonStyle(big: true))
                .disabled(model.state.mainBet < app.settings.table.minBet)
                .keyboardShortcut(.space, modifiers: [])
            }
            HStack(spacing: 10) {
                Label(model.selectedSpot.name, systemImage: "circle.dashed").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                Text(Fmt.money(model.stake(model.selectedSpot))).font(.data(13)).foregroundStyle(.primary)
                Spacer()
                Button("Clear all", systemImage: "xmark.circle") { model.clearAll() }
                    .font(.caption.weight(.semibold))
                    .buttonStyle(.borderless)
                Button("New shoe", systemImage: "shuffle") { model.newShoe() }
                    .font(.caption.weight(.semibold))
                    .buttonStyle(.borderless)
            }
            .labelStyle(.titleAndIcon)
        }
    }

    private var insurance: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Insurance? \(Fmt.money(model.state.insuranceCost))").font(.headline)
                Text(model.state.spots > 1 ? "Half of each bet. Pays 2 to 1 if the dealer has blackjack." : "Pays 2 to 1 if the dealer has blackjack.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button("No") { model.insurance(false) }.buttonStyle(GhostButtonStyle())
            Button("Take") { model.insurance(true) }.buttonStyle(BrassButtonStyle())
        }
    }

    private var actions: some View {
        let lg = model.legal
        let items: [(Action, Bool, String)] = [
            (.hit, lg.hit, "H"), (.stand, lg.stand, "S"), (.double, lg.double, "D"), (.split, lg.split, "P"), (.surrender, lg.surrender, "R"),
        ]
        return VStack(spacing: 8) {
            HStack(spacing: 6) {
                ForEach(items, id: \.0) { a, ok, key in
                    let primary = a == .hit || a == .stand
                    Button {
                        model.act(a)
                    } label: {
                        Text(a.short).frame(maxWidth: .infinity)
                    }
                    .buttonStyle(ActionButtonStyle(primary: primary))
                    .disabled(!ok)
                    .keyboardShortcut(KeyEquivalent(Character(key.lowercased())), modifiers: [])
                }
            }
            HStack {
                if let h = model.hint {
                    Label {
                        Text("\(h.action.label)\(h.index.map { " · \($0)" } ?? "")")
                    } icon: {
                        Image(systemName: "lightbulb.fill").foregroundStyle(Theme.brass)
                    }
                    .font(.caption.weight(.semibold))
                    .transition(.opacity)
                } else {
                    Text(app.settings.handSignals ? "Tap the felt to hit, swipe to stand." : "Every decision is graded.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("Hint", systemImage: "lightbulb") { model.showHint() }
                    .font(.caption.weight(.semibold))
                    .buttonStyle(.borderless)
            }
        }
    }
}

struct ActionButtonStyle: ButtonStyle {
    var primary: Bool
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.bold))
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .foregroundStyle(primary ? Color(hex: 0x2A1E06) : Theme.fg)
            .padding(.vertical, 12)
            .background {
                if primary {
                    Capsule().fill(LinearGradient(colors: [Theme.brassHi, Theme.brassLo], startPoint: .top, endPoint: .bottom))
                } else {
                    Capsule().fill(Theme.panel2)
                }
            }
            .overlay(Capsule().strokeBorder(primary ? Color.white.opacity(0.3) : Theme.line, lineWidth: 1))
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
            .opacity(enabled ? 1 : 0.35)
            .animation(.spring(response: 0.22, dampingFraction: 0.7), value: configuration.isPressed)
    }
}
