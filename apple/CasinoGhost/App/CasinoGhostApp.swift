import SwiftUI
import CasinoGhostCore

@main
struct CasinoGhostApp: App {
    @State private var app = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(app)
                .preferredColorScheme(scheme)
                .tint(Theme.brass)
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active: app.table.resume()
            case .background, .inactive:
                app.table.pause()
                app.saveSession()
            @unknown default: break
            }
        }
    }

    private var scheme: ColorScheme? {
        if app.screenshot != nil { return .dark }
        switch app.settings.appearance {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        @Bindable var app = app
        TabView(selection: $app.tab) {
            TableScreen()
                .tabItem { Label(AppTab.table.title, systemImage: AppTab.table.icon) }
                .tag(AppTab.table)
            LabScreen()
                .tabItem { Label(AppTab.lab.title, systemImage: AppTab.lab.icon) }
                .tag(AppTab.lab)
            StrategyScreen()
                .tabItem { Label(AppTab.strategy.title, systemImage: AppTab.strategy.icon) }
                .tag(AppTab.strategy)
            RulesScreen()
                .tabItem { Label(AppTab.rules.title, systemImage: AppTab.rules.icon) }
                .tag(AppTab.rules)
            SettingsScreen()
                .tabItem { Label(AppTab.settings.title, systemImage: AppTab.settings.icon) }
                .tag(AppTab.settings)
        }
        .onChange(of: app.tab) { _, _ in Haptics.select() }
    }
}

/// The table, its controls and the dashboard.
struct TableScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(\.horizontalSizeClass) private var hsize
    @State private var showCustomize = false

    var body: some View {
        NavigationStack {
            GeometryReader { geo in
                // side by side only when the felt keeps its natural width (about 600 pt) beside
                // the dashboard: iPad in landscape; portrait stacks them
                let wide = hsize == .regular && geo.size.width >= 1060
                ScrollViewReader { proxy in
                    ScrollView {
                        if wide {
                            let dash: CGFloat = 380
                            HStack(alignment: .top, spacing: 16) {
                                // the felt adds 14 pt of padding on each side of its content
                                FeltView(model: app.table, width: geo.size.width - 32 - 16 - dash - 28)
                                    .frame(maxWidth: .infinity)
                                DashboardView(model: app.table)
                                    .frame(width: dash)
                            }
                            .padding(16)
                        } else {
                            VStack(spacing: 14) {
                                FeltView(model: app.table, width: geo.size.width - 24)
                                if app.settings.showDashboard {
                                    DashboardView(model: app.table, columns: geo.size.width >= 760 ? 2 : 1).id("dashboard")
                                }
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                        }
                    }
                    .scrollIndicators(.hidden)
                    .onAppear {
                        if app.screenshot == "dashboard" {
                            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { proxy.scrollTo("dashboard", anchor: .top) }
                        }
                    }
                }
            }
            .background(Theme.background.ignoresSafeArea())
            .safeAreaInset(edge: .bottom, spacing: 0) {
                ControlsBar(model: app.table)
            }
            .navigationTitle("CasinoGhost")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 0) {
                        Text("CASINO").foregroundStyle(Theme.fg)
                        Text("GHOST").foregroundStyle(Theme.brass)
                    }
                    .font(.display(22, weight: .heavy))
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("CasinoGhost")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Dealing speed", selection: app.binding(\.dealSpeed)) {
                            ForEach(DealSpeed.allCases) { Text($0.label).tag($0) }
                        }
                        Toggle("Pin the count to the table", isOn: app.binding(\.pinCount))
                        Toggle("Show the true edge", isOn: app.binding(\.revealExactEdge))
                        Toggle("Hand signals", isOn: app.binding(\.handSignals))
                        Toggle("Dashboard", isOn: app.binding(\.showDashboard))
                    } label: {
                        Image(systemName: "slider.horizontal.below.rectangle")
                    }
                    .accessibilityLabel("Table options")
                }
            }
        }
        .task {
            if let shot = app.screenshot, shot == "table" || shot == "dashboard" {
                await ScreenshotDirector.prepareTable(app.table)
            }
        }
    }
}

/// Drives the table into a representative state for App Store screenshots.
@MainActor
enum ScreenshotDirector {
    static func prepareTable(_ t: TableModel) async {
        try? await Task.sleep(nanoseconds: 600_000_000)
        // deal instantly until the hand to capture is on the table, so the screenshot never
        // lands mid-deal; the hand at rest looks the same either way
        let normal = t.settings
        var instant = normal
        instant.dealSpeed = .instant
        t.update(settings: instant)
        defer { t.update(settings: normal) }
        t.addChip(25)
        for round in 0..<30 {
            while t.busy { try? await Task.sleep(nanoseconds: 50_000_000) }
            t.deal()
            try? await Task.sleep(nanoseconds: 80_000_000)
            while t.busy { try? await Task.sleep(nanoseconds: 50_000_000) }
            if t.phase == .insurance { t.insurance(false) }
            while t.busy { try? await Task.sleep(nanoseconds: 50_000_000) }
            // stop at an interesting decision after a few rounds
            if round >= 8, t.phase == .player, t.state.hands.first.map({ $0.total >= 12 && $0.total <= 16 }) == true {
                return
            }
            while t.phase == .player {
                if let a = t.game.advice()?.action { t.act(a) } else { break }
                try? await Task.sleep(nanoseconds: 50_000_000)
                while t.busy { try? await Task.sleep(nanoseconds: 50_000_000) }
            }
        }
    }
}
