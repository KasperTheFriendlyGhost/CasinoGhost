import SwiftUI
import CasinoGhostCore

struct RulesScreen: View {
    @Environment(AppModel.self) private var app
    @State private var shorthand = ""
    @State private var parsed: ParsedRules?

    var body: some View {
        let s = app.settings
        NavigationStack {
            Form {
                Section {
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("House edge").font(.caption).foregroundStyle(.secondary)
                            Text(Fmt.pct(houseEdge(rules: s.rules), digits: 3, signed: false)).font(.display(32, weight: .heavy))
                        }
                        Spacer()
                        Text(s.rules.shorthand).font(.caption.monospaced()).multilineTextAlignment(.trailing).foregroundStyle(.secondary)
                    }
                    Text(s.rules.summary.prefix(1).uppercased() + s.rules.summary.dropFirst() + ".").font(.footnote).foregroundStyle(.secondary)
                }

                Section("Common tables") {
                    ForEach(gamePresets(), id: \.id) { p in
                        Button {
                            app.update { $0.rules = p.rules; $0.table = p.table }
                            Haptics.select()
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(p.name).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.fg)
                                    Text(p.blurb).font(.caption).foregroundStyle(Theme.muted)
                                }
                                Spacer()
                                VerdictTag(verdict: p.verdict)
                            }
                        }
                    }
                }

                Section {
                    TextField("e.g. 6D H17 DAS LS 3:2 PEN:80%", text: $shorthand)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .font(.body.monospaced())
                        .onSubmit(applyShorthand)
                    Button("Apply", action: applyShorthand).disabled(shorthand.trimmingCharacters(in: .whitespaces).isEmpty)
                    if let parsed {
                        if !parsed.understood.isEmpty {
                            Text("Understood: " + parsed.understood.joined(separator: ", ")).font(.caption).foregroundStyle(Theme.good)
                        }
                        if !parsed.ignored.isEmpty {
                            Text("Not recognised: " + parsed.ignored.joined(separator: " ")).font(.caption).foregroundStyle(Theme.warn)
                        }
                    }
                } header: {
                    Text("Describe the table")
                } footer: {
                    Text("Type the rules as they're printed on the felt or a rules card. Plain English works too: \"six decks, dealer hits soft 17, late surrender\".")
                }

                Section("Rules") {
                    Stepper("Decks: \(s.rules.decks)", value: app.binding(\.rules.decks), in: 1...8)
                    Toggle("Dealer hits soft 17", isOn: app.binding(\.rules.h17))
                    Picker("Blackjack pays", selection: app.binding(\.rules.bjPays)) {
                        Text("3:2").tag(1.5)
                        Text("6:5").tag(1.2)
                        Text("7:5").tag(1.4)
                        Text("1:1").tag(1.0)
                        Text("2:1").tag(2.0)
                    }
                    Picker("Double on", selection: app.binding(\.rules.doubleOn)) {
                        ForEach(DoubleOn.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    Toggle("Double after split", isOn: app.binding(\.rules.das))
                    Picker("Split to", selection: app.binding(\.rules.maxHands)) {
                        Text("No splitting").tag(UInt32(1))
                        Text("2 hands").tag(UInt32(2))
                        Text("3 hands").tag(UInt32(3))
                        Text("4 hands").tag(UInt32(4))
                    }
                    Toggle("Resplit aces", isOn: app.binding(\.rules.resplitAces))
                    Toggle("Hit split aces", isOn: app.binding(\.rules.hitSplitAces))
                    Picker("Surrender", selection: app.binding(\.rules.surrender)) {
                        ForEach(Surrender.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    Toggle("Dealer peeks for blackjack", isOn: app.binding(\.rules.peek))
                    if !s.rules.peek {
                        Toggle("Lose only the original bet to a blackjack", isOn: app.binding(\.rules.obo))
                    }
                    Toggle("Continuous shuffler", isOn: app.binding(\.rules.csm))
                    if !s.rules.csm {
                        VStack(alignment: .leading) {
                            Text("Penetration: \(Int((s.rules.penetration * 100).rounded()))% dealt (\(String(format: "%.1f", s.rules.penetration * Double(s.rules.decks))) of \(s.rules.decks) decks)")
                            Slider(value: app.binding(\.rules.penetration), in: 0.5...0.92, step: 0.01)
                        }
                    }
                }

                Section {
                    Stepper("Other players: \(s.table.otherPlayers)", value: app.binding(\.table.otherPlayers), in: 0...6)
                    Stepper("Rounds per hour: \(Int(s.table.roundsPerHour))", value: app.binding(\.table.roundsPerHour), in: 40...250, step: 10)
                    Stepper("Minimum bet: \(Fmt.money(s.table.minBet))", value: app.binding(\.table.minBet), in: 5...500, step: 5)
                    Stepper("Maximum bet: \(Fmt.money(s.table.maxBet))", value: app.binding(\.table.maxBet), in: 100...25_000, step: 100)
                } header: {
                    Text("Table")
                } footer: {
                    Text("Other players take cards you have to count, and slow the game down.")
                }

                Section {
                    Picker("Count", selection: app.binding(\.countId)) {
                        ForEach(CountingSystems.all, id: \.id) { Text($0.name).tag($0.id) }
                    }
                    CountTags(system: s.count)
                    if s.count.balanced {
                        Picker("True count", selection: app.binding(\.trueCount.rounding)) {
                            ForEach(Rounding.allCases, id: \.self) { Text($0.label).tag($0) }
                        }
                        Picker("Estimate decks to", selection: app.binding(\.trueCount.deckResolution)) {
                            Text("The card").tag(0.0)
                            Text("Quarter deck").tag(0.25)
                            Text("Half deck").tag(0.5)
                            Text("Whole deck").tag(1.0)
                        }
                    }
                    Picker("Index plays", selection: app.binding(\.indexMode)) {
                        ForEach(IndexMode.allCases) { Text($0.label).tag($0) }
                    }
                } header: {
                    Text("Counting")
                } footer: {
                    Text(countingFooter(s))
                }
            }
            .navigationTitle("Rules")
        }
    }

    private func countingFooter(_ s: AppSettings) -> String {
        var t = s.count.note + " " + s.trueCount.rounding.detail
        if s.countId != "hilo" && s.indexMode != .none && s.indexMode != .generated {
            t += " Published indices are for Hi-Lo; generate indices for \(s.count.name) in the Lab."
        }
        return t
    }

    private func applyShorthand() {
        let r = parseRules(text: shorthand, rules: app.settings.rules, table: app.settings.table)
        parsed = r
        app.update { $0.rules = r.rules; $0.table = r.table }
        Haptics.success()
    }
}

struct VerdictTag: View {
    let verdict: String

    var body: some View {
        let color: Color = {
            switch verdict {
            case "Great": return Theme.good
            case "Beatable": return Theme.good.opacity(0.8)
            case "Marginal": return Theme.warn
            case "Poor": return Theme.warn.opacity(0.8)
            default: return Theme.bad
            }
        }()
        Text(verdict)
            .font(.caption2.weight(.bold))
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.15), in: Capsule())
    }
}

/// Tag values of a count, A through 10.
struct CountTags: View {
    let system: CountingSystem

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 3) {
                ForEach(Array(system.tags.enumerated()), id: \.offset) { i, t in
                    VStack(spacing: 1) {
                        Text(i == 0 ? "A" : i == 9 ? "10" : String(i + 1)).font(.caption2).foregroundStyle(.secondary)
                        Text(t == 0 ? "0" : (t > 0 ? "+" : "−") + (t.rounded() == t ? String(Int(abs(t))) : String(abs(t))))
                            .font(.data(12, weight: .bold))
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            HStack(spacing: 12) {
                Text(system.balanced ? "Balanced" : "Unbalanced")
                Text("Level \(system.level.rounded() == system.level ? String(Int(system.level)) : String(system.level))")
                Text("Betting correlation \(String(format: "%.2f", system.bettingCorrelation))")
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
    }
}
