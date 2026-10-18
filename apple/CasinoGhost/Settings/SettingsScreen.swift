import SwiftUI
import CasinoGhostCore

struct SettingsScreen: View {
    @Environment(AppModel.self) private var app
    @State private var confirmReset = false
    @State private var confirmErase = false

    private let site = URL(string: "https://kasperthefriendlyghost.github.io/CasinoGhost/")!

    var body: some View {
        let s = app.settings
        NavigationStack {
            Form {
                Section("Table") {
                    Picker("Dealing speed", selection: app.binding(\.dealSpeed)) {
                        ForEach(DealSpeed.allCases) { Text($0.label).tag($0) }
                    }
                    Toggle("Pin the count to the table", isOn: app.binding(\.pinCount))
                    Toggle("Hand signals (tap to hit, swipe to stand)", isOn: app.binding(\.handSignals))
                    Toggle("Show the true edge on the gauge", isOn: app.binding(\.revealExactEdge))
                    Toggle("Dashboard under the table", isOn: app.binding(\.showDashboard))
                }

                Section("Sound and haptics") {
                    Toggle("Table sounds", isOn: app.binding(\.sound))
                    if s.sound {
                        HStack {
                            Image(systemName: "speaker.fill").foregroundStyle(.secondary)
                            Slider(value: app.binding(\.volume), in: 0...1) { editing in
                                if !editing { SoundPlayer.shared.card() }
                            }
                            Image(systemName: "speaker.wave.3.fill").foregroundStyle(.secondary)
                        }
                    }
                    Toggle("Haptic feedback", isOn: app.binding(\.haptics))
                }

                Section("Appearance") {
                    Picker("Theme", selection: app.binding(\.appearance)) {
                        ForEach(Appearance.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }

                Section {
                    LabeledContent("Starting bankroll") {
                        TextField("Bankroll", value: app.binding(\.startingBankroll), format: .currency(code: "USD").precision(.fractionLength(0)))
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                    }
                    Button("Reset session…") { confirmReset = true }
                    Button("Erase all data…", role: .destructive) { confirmErase = true }
                } header: {
                    Text("Session")
                } footer: {
                    Text("Your bankroll, statistics and the shoe in play are saved on this device after every round.")
                }

                Section {
                    Text("CasinoGhost is a training tool. No real money is wagered and nothing can be won. Counting cards does not guarantee winning, and casinos may refuse play to counters.")
                        .font(.footnote)
                    Link("National Council on Problem Gambling (US)", destination: URL(string: "https://www.ncpgambling.org/help-treatment/")!)
                    Link("BeGambleAware (UK)", destination: URL(string: "https://www.begambleaware.org/")!)
                } header: {
                    Text("Play responsibly")
                }

                Section {
                    LabeledContent("Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—")
                    LabeledContent("Engine", value: engineVersion())
                    Link("Privacy policy", destination: site.appendingPathComponent("privacy.html"))
                    Link("Support", destination: site.appendingPathComponent("support.html"))
                    Text("Strategy engine adapted from cutcard (MIT). Card faces by Adrian Kennard (CC0). Exact analysis, simulation and index generation by the CasinoGhost engine, written in Rust.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } header: {
                    Text("About")
                }
            }
            .navigationTitle("Settings")
            .confirmationDialog("Reset your session?", isPresented: $confirmReset, titleVisibility: .visible) {
                Button("Reset session", role: .destructive) { app.resetSession() }
            } message: {
                Text("Bankroll, statistics and charts start again. Settings stay.")
            }
            .confirmationDialog("Erase all data?", isPresented: $confirmErase, titleVisibility: .visible) {
                Button("Erase everything", role: .destructive) { app.eraseAll() }
            } message: {
                Text("Settings, the session and saved analysis are removed from this device.")
            }
        }
    }
}
