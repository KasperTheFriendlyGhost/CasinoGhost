import SwiftUI
import CryptoKit
import CasinoGhostCore

enum AppTab: String, CaseIterable, Identifiable {
    case table, lab, strategy, rules, settings
    var id: String { rawValue }
    var title: String {
        switch self {
        case .table: return "Table"
        case .lab: return "Lab"
        case .strategy: return "Strategy"
        case .rules: return "Rules"
        case .settings: return "Settings"
        }
    }
    var icon: String {
        switch self {
        case .table: return "suit.spade.fill"
        case .lab: return "flask.fill"
        case .strategy: return "square.grid.3x3.fill"
        case .rules: return "slider.horizontal.3"
        case .settings: return "gearshape.fill"
        }
    }
}

/// Files the app keeps: settings in UserDefaults, the session and caches on disk.
enum Storage {
    private static let settingsKey = "casinoghost.settings.v2"

    static func loadSettings() -> AppSettings {
        guard let data = UserDefaults.standard.data(forKey: settingsKey),
              let s = try? JSONDecoder().decode(AppSettings.self, from: data) else { return AppSettings() }
        return s
    }

    static func save(_ s: AppSettings) {
        if let data = try? JSONEncoder().encode(s) { UserDefaults.standard.set(data, forKey: settingsKey) }
    }

    private static var supportDir: URL {
        let url = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("CasinoGhost", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    static var cacheDir: URL {
        let url = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("CasinoGhost", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    static func loadSession() -> String? {
        try? String(contentsOf: supportDir.appendingPathComponent("session.json"), encoding: .utf8)
    }

    static func saveSession(_ json: String) {
        try? json.write(to: supportDir.appendingPathComponent("session.json"), atomically: true, encoding: .utf8)
    }

    static func eraseAll() {
        UserDefaults.standard.removeObject(forKey: settingsKey)
        try? FileManager.default.removeItem(at: supportDir)
        try? FileManager.default.removeItem(at: cacheDir)
    }

    /// Stable hash of any encodable value (for cache file names).
    static func key<T: Encodable>(_ value: T) -> String {
        let enc = JSONEncoder()
        enc.outputFormatting = .sortedKeys
        let data = (try? enc.encode(value)) ?? Data()
        return SHA256.hash(data: data).prefix(12).map { String(format: "%02x", $0) }.joined()
    }

    static func readCache<T: Decodable>(_ type: T.Type, _ name: String) -> T? {
        guard let data = try? Data(contentsOf: cacheDir.appendingPathComponent(name)) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    static func writeCache<T: Encodable>(_ value: T, _ name: String) {
        if let data = try? JSONEncoder().encode(value) { try? data.write(to: cacheDir.appendingPathComponent(name)) }
    }
}

/// Runs a blocking engine call off the main thread, reporting progress.
enum Jobs {
    static func run<T>(_ progress: ProgressHandle, report: @escaping @MainActor (Double) -> Void, _ work: @escaping () -> T) async -> T {
        let task = Task.detached(priority: .userInitiated) { work() }
        let poll = Task { @MainActor in
            while !Task.isCancelled {
                report(progress.fraction())
                try? await Task.sleep(nanoseconds: 120_000_000)
            }
        }
        let value = await task.value
        poll.cancel()
        await MainActor.run { report(1) }
        return value
    }
}

/// Long-running analysis shared across screens: the edge gauge's curve and generated indices.
@MainActor
@Observable
final class AnalysisStore {
    private(set) var edgeCurve: EdgeCurve?
    private(set) var edgeProgress: Double?
    private(set) var indexReport: IndexReport?
    private(set) var indexProgress: Double?
    private var edgeKey = ""
    private var indexKey = ""
    private var edgeJob: ProgressHandle?
    private var indexJob: ProgressHandle?

    static func setup(_ s: AppSettings, plays: [IndexEntry], insurance: Double?, rounds: UInt64, seed: UInt64 = 2026) -> SimulationSetup {
        SimulationSetup(rules: s.rules, table: s.table, count: s.count, trueCount: s.trueCount,
                        plays: plays, insuranceIndex: insurance, rounds: rounds, seed: seed)
    }

    /// Edge curve for the current game: from the cache, or simulated in the background.
    func refreshEdgeCurve(_ s: AppSettings, plays: [IndexEntry], insurance: Double?, apply: @escaping (EdgeCurve) -> Void) {
        let setup = Self.setup(s, plays: plays, insurance: insurance, rounds: 10_000_000)
        let key = Storage.key(setup)
        guard key != edgeKey else { return }
        edgeKey = key
        edgeJob?.cancel()
        if let cached = Storage.readCache(EdgeCurve.self, "edge-\(key).json") {
            edgeCurve = cached
            edgeProgress = nil
            apply(cached)
            return
        }
        let handle = ProgressHandle()
        edgeJob = handle
        edgeProgress = 0
        Task {
            let curve = await Jobs.run(handle, report: { [weak self] p in
                if self?.edgeJob === handle { self?.edgeProgress = p }
            }) {
                buildEdgeCurve(setup: setup, spreadPerCount: 48, progress: handle)
            }
            guard self.edgeJob === handle, !handle.isCancelled() else { return }
            self.edgeCurve = curve
            self.edgeProgress = nil
            Storage.writeCache(curve, "edge-\(key).json")
            apply(curve)
        }
    }

    func cachedIndices(for s: AppSettings) -> IndexReport? {
        let key = Self.indexKey(s)
        if key == indexKey, let r = indexReport { return r }
        if let r = Storage.readCache(IndexReport.self, "indices-\(key).json") {
            indexKey = key
            indexReport = r
            return r
        }
        return nil
    }

    private static func indexKey(_ s: AppSettings) -> String {
        Storage.key(setup(s, plays: [], insurance: nil, rounds: 0))
    }

    /// Generate indices for the current rules, count and true-count convention.
    func generateIndices(_ s: AppSettings, done: @escaping (IndexReport) -> Void) {
        let key = Self.indexKey(s)
        let setup = Self.setup(s, plays: [], insurance: nil, rounds: 3_000_000, seed: 77)
        indexJob?.cancel()
        let handle = ProgressHandle()
        indexJob = handle
        indexProgress = 0
        Task {
            let report = await Jobs.run(handle, report: { [weak self] p in
                if self?.indexJob === handle { self?.indexProgress = p }
            }) {
                CasinoGhostCore.generateIndices(setup: setup, perCount: 90, progress: handle)
            }
            guard self.indexJob === handle, !handle.isCancelled() else { return }
            self.indexKey = key
            self.indexReport = report
            self.indexProgress = nil
            Storage.writeCache(report, "indices-\(key).json")
            done(report)
        }
    }

    func cancelIndices() {
        indexJob?.cancel()
        indexJob = nil
        indexProgress = nil
    }
}

/// The app's state: settings, the table and shared analysis.
@MainActor
@Observable
final class AppModel {
    private(set) var settings: AppSettings
    private(set) var table: TableModel
    let analysis = AnalysisStore()
    var tab: AppTab = .table
    /// Set when launched with `-screenshot <screen>` (App Store screenshots).
    let screenshot: String?

    init() {
        let args = ProcessInfo.processInfo.arguments
        let shot = args.firstIndex(of: "-screenshot").flatMap { args.indices.contains($0 + 1) ? args[$0 + 1] : nil }
        screenshot = shot
        var s = shot == nil ? Storage.loadSettings() : AppSettings()
        if shot != nil {
            // a full table: three other players (two before you, one after) and two hands
            s.table.otherPlayers = 3
            s.spots = 2
            s.dealSpeed = .fast
        }
        settings = s
        let plays = AppModel.plays(for: s, report: nil)
        let session = shot == nil ? Storage.loadSession() : nil
        let game = TableGame(config: AppModel.config(s, plays), session: session, bankroll: s.startingBankroll, seed: shot == nil ? nil : 9)
        table = TableModel(game: game, settings: s)
        applyFeel()
        // indices generated earlier for this game, if any
        if s.indexMode == .generated, analysis.cachedIndices(for: s) != nil {
            rebuildTable(force: true)
        }
        table.onRoundSettled = { [weak self] in self?.saveSession() }
        refreshEdge()
        if let shot { tab = AppTab(rawValue: shot) ?? (shot == "dashboard" ? .table : .table) }
    }

    // MARK: Settings

    func update(_ change: (inout AppSettings) -> Void) {
        var s = settings
        change(&s)
        guard s != settings else { return }
        let old = settings
        settings = s
        Storage.save(s)
        applyFeel()
        table.update(settings: s)
        if s.gameKey != old.gameKey {
            rebuildTable(force: false)
        } else if s.table != old.table {
            refreshEdge()
        }
    }

    func binding<T>(_ path: WritableKeyPath<AppSettings, T>) -> Binding<T> {
        Binding(get: { self.settings[keyPath: path] }, set: { v in self.update { $0[keyPath: path] = v } })
    }

    private func applyFeel() {
        Haptics.enabled = settings.haptics
        SoundPlayer.shared.enabled = settings.sound
        SoundPlayer.shared.volume = Float(settings.volume)
    }

    /// The plays and insurance index the player uses, in their count's units.
    static func plays(for s: AppSettings, report: IndexReport?) -> (plays: [IndexEntry], insurance: Double?) {
        if s.indexMode == .generated || s.countId != "hilo" {
            guard s.indexMode != .none, let r = report else { return ([], nil) }
            let plays = s.indexMode == .insurance ? [] : r.indices.filter { $0.gainPer100 > 0.0005 }.map(\.play)
            return (plays, r.insurance)
        }
        guard let set = s.indexMode.publishedSet else { return ([], nil) }
        let plays = publishedIndices(rules: s.rules, set: set)
        return (plays, s.indexMode == .none ? nil : hiloInsuranceIndex())
    }

    var activePlays: (plays: [IndexEntry], insurance: Double?) {
        AppModel.plays(for: settings, report: analysis.cachedIndices(for: settings))
    }

    static func config(_ s: AppSettings, _ p: (plays: [IndexEntry], insurance: Double?)) -> TableConfig {
        TableConfig(rules: s.rules, count: s.count, trueCount: s.trueCount, plays: p.plays, insuranceIndex: p.insurance,
                    useIndices: s.indexMode != .none, pays: s.pays, minBet: s.table.minBet, maxBet: s.table.maxBet,
                    bots: s.table.otherPlayers, spots: UInt32(s.spots))
    }

    /// A new table for new rules, carrying the session (bankroll, stats, and the shoe if it fits).
    func rebuildTable(force: Bool) {
        let snapshot = table.game.snapshot()
        let p = activePlays
        let game = TableGame(config: AppModel.config(settings, p), session: snapshot, bankroll: settings.startingBankroll, seed: nil)
        table.replace(game: game, settings: settings)
        refreshEdge()
    }

    func refreshEdge() {
        let p = activePlays
        let model = table
        analysis.refreshEdgeCurve(settings, plays: p.plays, insurance: p.insurance) { curve in
            model.setEdgeCurve(curve)
        }
    }

    func useGeneratedIndices() {
        update { $0.indexMode = .generated }
        rebuildTable(force: true)
    }

    // MARK: Session

    func saveSession() {
        guard screenshot == nil else { return }
        let json = table.game.snapshot()
        Task.detached(priority: .background) { Storage.saveSession(json) }
    }

    func resetSession() {
        table.resetSession(bankroll: settings.startingBankroll)
        saveSession()
    }

    func eraseAll() {
        Storage.eraseAll()
        settings = AppSettings()
        applyFeel()
        let p = AppModel.plays(for: settings, report: nil)
        table.replace(game: TableGame(config: AppModel.config(settings, p), session: nil, bankroll: settings.startingBankroll, seed: nil), settings: settings)
        refreshEdge()
    }
}
