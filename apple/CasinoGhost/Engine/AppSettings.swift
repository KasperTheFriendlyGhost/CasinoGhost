import Foundation
import CasinoGhostCore

/// Which count-based plays the player uses at the table.
enum IndexMode: String, Codable, CaseIterable, Identifiable {
    case none, insurance, i18, i18fab4, full, generated
    var id: String { rawValue }

    var label: String {
        switch self {
        case .none: return "Off"
        case .insurance: return "Insurance only"
        case .i18: return "Illustrious 18"
        case .i18fab4: return "I18 + Fab 4"
        case .full: return "Extended set"
        case .generated: return "Generated for this game"
        }
    }

    var publishedSet: PublishedIndices? {
        switch self {
        case .none: return .noIndices
        case .insurance: return .insuranceOnly
        case .i18: return .i18
        case .i18fab4: return .i18Fab4
        case .full: return .full
        case .generated: return nil
        }
    }
}

enum DealSpeed: String, Codable, CaseIterable, Identifiable {
    case slow, normal, fast, instant
    var id: String { rawValue }
    var label: String { rawValue.capitalized }
    /// Seconds between cards.
    var pace: Double {
        switch self {
        case .slow: return 0.55
        case .normal: return 0.34
        case .fast: return 0.17
        case .instant: return 0
        }
    }
}

enum Appearance: String, Codable, CaseIterable, Identifiable {
    case system, light, dark
    var id: String { rawValue }
    var label: String { rawValue.capitalized }
}

/// Everything the player chooses, saved between launches.
struct AppSettings: Codable, Equatable {
    var rules: GameRules = defaultRules()
    /// Table conditions; `otherPlayers` is the number of other players seated with you.
    var table: TableSetup = TableSetup(otherPlayers: 0, roundsPerHour: 90, minBet: 25, maxBet: 1000)
    var countId: String = "hilo"
    var trueCount: TrueCountRule = defaultTrueCountRule()
    var indexMode: IndexMode = .i18fab4
    /// Paytables for Perfect Pairs, 21+3 and Lucky Ladies.
    var pays: [[Double]] = sideBets().map { $0.presets[0].pays }
    var startingBankroll: Double = 10_000
    var dealSpeed: DealSpeed = .normal
    var pinCount: Bool = true
    var revealExactEdge: Bool = false
    var handSignals: Bool = true
    var sound: Bool = true
    var volume: Double = 0.7
    var haptics: Bool = true
    var appearance: Appearance = .system
    var showDashboard: Bool = true

    init() {}

    var count: CountingSystem {
        CountingSystems.byId(countId)
    }

    /// Count-system label for the number a player acts on.
    var countLabel: String { count.balanced ? "TC" : "RC" }

    private enum Keys: String, CodingKey {
        case rules, table, countId, trueCount, indexMode, pays, startingBankroll, dealSpeed, pinCount
        case revealExactEdge, handSignals, sound, volume, haptics, appearance, showDashboard
    }

    // Decode tolerantly: settings saved by an older version keep working.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        let d = AppSettings()
        rules = (try? c.decodeIfPresent(GameRules.self, forKey: .rules)) ?? d.rules
        table = (try? c.decodeIfPresent(TableSetup.self, forKey: .table)) ?? d.table
        countId = (try? c.decodeIfPresent(String.self, forKey: .countId)) ?? d.countId
        trueCount = (try? c.decodeIfPresent(TrueCountRule.self, forKey: .trueCount)) ?? d.trueCount
        indexMode = (try? c.decodeIfPresent(IndexMode.self, forKey: .indexMode)) ?? d.indexMode
        pays = (try? c.decodeIfPresent([[Double]].self, forKey: .pays)) ?? d.pays
        startingBankroll = (try? c.decodeIfPresent(Double.self, forKey: .startingBankroll)) ?? d.startingBankroll
        dealSpeed = (try? c.decodeIfPresent(DealSpeed.self, forKey: .dealSpeed)) ?? d.dealSpeed
        pinCount = (try? c.decodeIfPresent(Bool.self, forKey: .pinCount)) ?? d.pinCount
        revealExactEdge = (try? c.decodeIfPresent(Bool.self, forKey: .revealExactEdge)) ?? d.revealExactEdge
        handSignals = (try? c.decodeIfPresent(Bool.self, forKey: .handSignals)) ?? d.handSignals
        sound = (try? c.decodeIfPresent(Bool.self, forKey: .sound)) ?? d.sound
        volume = (try? c.decodeIfPresent(Double.self, forKey: .volume)) ?? d.volume
        haptics = (try? c.decodeIfPresent(Bool.self, forKey: .haptics)) ?? d.haptics
        appearance = (try? c.decodeIfPresent(Appearance.self, forKey: .appearance)) ?? d.appearance
        showDashboard = (try? c.decodeIfPresent(Bool.self, forKey: .showDashboard)) ?? d.showDashboard
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(rules, forKey: .rules)
        try c.encode(table, forKey: .table)
        try c.encode(countId, forKey: .countId)
        try c.encode(trueCount, forKey: .trueCount)
        try c.encode(indexMode, forKey: .indexMode)
        try c.encode(pays, forKey: .pays)
        try c.encode(startingBankroll, forKey: .startingBankroll)
        try c.encode(dealSpeed, forKey: .dealSpeed)
        try c.encode(pinCount, forKey: .pinCount)
        try c.encode(revealExactEdge, forKey: .revealExactEdge)
        try c.encode(handSignals, forKey: .handSignals)
        try c.encode(sound, forKey: .sound)
        try c.encode(volume, forKey: .volume)
        try c.encode(haptics, forKey: .haptics)
        try c.encode(appearance, forKey: .appearance)
        try c.encode(showDashboard, forKey: .showDashboard)
    }

    /// The parts of the settings that change how the game plays (a new table is needed).
    struct GameKey: Equatable, Hashable {
        var rules: GameRules
        var countId: String
        var trueCount: TrueCountRule
        var indexMode: IndexMode
        var pays: [[Double]]
        var minBet: Double
        var maxBet: Double
        var bots: UInt32
    }

    var gameKey: GameKey {
        GameKey(rules: rules, countId: countId, trueCount: trueCount, indexMode: indexMode, pays: pays,
                minBet: table.minBet, maxBet: table.maxBet, bots: table.otherPlayers)
    }
}

enum CountingSystems {
    static let all: [CountingSystem] = countingSystems()
    static func byId(_ id: String) -> CountingSystem {
        all.first { $0.id == id } ?? all[0]
    }
}

// MARK: - Labels for engine types

extension Surrender {
    var label: String {
        switch self {
        case .noSurrender: return "None"
        case .late: return "Late"
        case .early: return "Early"
        }
    }
}

extension DoubleOn {
    var label: String {
        switch self {
        case .any: return "Any two cards"
        case .nineToEleven: return "9 to 11"
        case .tenToEleven: return "10 or 11"
        case .noDoubling: return "Not allowed"
        }
    }
}

extension Rounding {
    var label: String {
        switch self {
        case .floor: return "Floor"
        case .truncate: return "Truncate"
        case .round: return "Round"
        case .exact: return "Exact"
        }
    }
    var detail: String {
        switch self {
        case .floor: return "−0.5 becomes −1. The usual convention for Hi-Lo indices."
        case .truncate: return "Drop the fraction: −0.5 becomes 0."
        case .round: return "Round to the nearest whole count."
        case .exact: return "Use the exact ratio (indices to one decimal)."
        }
    }
}

extension Action {
    var label: String {
        switch self {
        case .stand: return "Stand"
        case .hit: return "Hit"
        case .double: return "Double"
        case .split: return "Split"
        case .surrender: return "Surrender"
        }
    }
    var short: String {
        switch self {
        case .surrender: return "Surr."
        default: return label
        }
    }
}

extension GameRules {
    var shorthand: String { rulesShorthand(rules: self) }
    var summary: String { rulesDescription(rules: self) }
    var bjLabel: String {
        switch bjPays {
        case 1.5: return "3:2"
        case 1.2: return "6:5"
        case 1.4: return "7:5"
        case 2.0: return "2:1"
        case 1.0: return "1:1"
        default: return String(format: "%.2g:1", bjPays)
        }
    }
}

extension PlayingCard {
    var value: Int { rank > 10 ? 10 : Int(rank) }
    var rankLabel: String {
        switch rank {
        case 1: return "A"
        case 11: return "J"
        case 12: return "Q"
        case 13: return "K"
        default: return String(rank)
        }
    }
    var suitSymbol: String { ["♠", "♥", "♦", "♣"][Int(suit)] }
    var suitName: String { ["spades", "hearts", "diamonds", "clubs"][Int(suit)] }
    var assetName: String { "Cards/\(suitName)-\(rank)" }
    var accessibilityName: String {
        let r: String
        switch rank {
        case 1: r = "Ace"
        case 11: r = "Jack"
        case 12: r = "Queen"
        case 13: r = "King"
        default: r = String(rank)
        }
        return "\(r) of \(suitName)"
    }
}

/// Best total of a set of card values (aces count 11 when they fit).
func handTotal(_ cards: [PlayingCard]) -> (total: Int, soft: Bool) {
    let t = cards.reduce(0) { $0 + $1.value }
    let ace = cards.contains { $0.rank == 1 }
    if ace && t + 10 <= 21 { return (t + 10, true) }
    return (t, false)
}
