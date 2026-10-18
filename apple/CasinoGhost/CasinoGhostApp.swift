import SwiftUI
import CasinoGhostCore

@main
struct CasinoGhostApp: App {
    var body: some Scene {
        WindowGroup {
            BootstrapView()
        }
    }
}

/// Temporary: proves the Rust engine links and answers.
struct BootstrapView: View {
    var body: some View {
        let rules = defaultRules()
        VStack(spacing: 12) {
            Text("CasinoGhost").font(.largeTitle.bold())
            Text("Engine \(engineVersion())")
            Text(String(format: "House edge %.3f%%", houseEdge(rules: rules) * 100))
            Text(rulesShorthand(rules: rules)).font(.caption.monospaced())
        }
        .padding()
    }
}
