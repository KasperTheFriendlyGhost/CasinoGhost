import SwiftUI
import CasinoGhostCore

/// A card as shown on the felt. `id` is unique for the life of the table, so a card keeps its
/// identity (and animation) when hands are split or rearranged.
struct DCard: Identifiable, Equatable {
    let id: Int
    let card: PlayingCard
    var faceUp: Bool
}

struct DHand: Identifiable, Equatable {
    let id: Int
    var cards: [DCard]
}

enum BetSpot: Int, CaseIterable, Identifiable {
    case perfectPairs, twentyOnePlusThree, main, luckyLadies
    var id: Int { rawValue }

    var sideBet: SideBetKind? {
        switch self {
        case .perfectPairs: return .perfectPairs
        case .twentyOnePlusThree: return .twentyOnePlusThree
        case .luckyLadies: return .luckyLadies
        case .main: return nil
        }
    }
    var label: String {
        switch self {
        case .perfectPairs: return "PP"
        case .twentyOnePlusThree: return "21+3"
        case .main: return "Bet"
        case .luckyLadies: return "LL"
        }
    }
    var name: String {
        switch self {
        case .perfectPairs: return "Perfect Pairs"
        case .twentyOnePlusThree: return "21+3"
        case .main: return "Main bet"
        case .luckyLadies: return "Lucky Ladies"
        }
    }
    var sideIndex: Int? {
        switch self {
        case .perfectPairs: return 0
        case .twentyOnePlusThree: return 1
        case .luckyLadies: return 2
        case .main: return nil
        }
    }
}

/// Drives the table: sends commands to the engine and plays its events back as animation.
@MainActor
@Observable
final class TableModel {
    private(set) var game: TableGame
    private(set) var state: TableState
    private(set) var settings: AppSettings

    // What's on the felt right now.
    var dealer: [DCard] = []
    var hands: [DHand] = []
    var bots: [[DHand]] = []

    /// Counts as the player has seen them: they tick as each card lands.
    private(set) var runningCount: Double
    private(set) var count: Double
    private(set) var cardsLeft: Int

    private(set) var busy = false
    private(set) var collecting = false
    private(set) var showOutcome = false
    private(set) var dealerLine: String = "Place your bets."
    private(set) var dealerLineID = 0
    var hint: Advice?
    private(set) var mistake: DecisionRecord?
    private(set) var exactEdge: Double?
    private(set) var edgeCurve: EdgeCurve?
    private(set) var edgeProfile: EdgeProfile?
    private(set) var shuffleTick = 0
    /// Spot the chip buttons add to.
    var selectedSpot: BetSpot = .main
    /// Settled rounds and recent decisions, refreshed after each round.
    private(set) var history: [RoundSummary] = []
    private(set) var log: [DecisionRecord] = []

    /// Called after every settled round (to save the session).
    var onRoundSettled: (() -> Void)?

    private var nextID = 1
    private var mistakeTask: Task<Void, Never>?

    init(game: TableGame, settings: AppSettings) {
        self.game = game
        self.settings = settings
        let s = game.state()
        state = s
        runningCount = s.runningCount
        count = s.count
        cardsLeft = Int(s.cardsLeft)
        history = game.rounds()
        log = game.log()
        refreshExactEdge()
    }

    // MARK: - Configuration

    func replace(game newGame: TableGame, settings newSettings: AppSettings) {
        game = newGame
        settings = newSettings
        dealer = []
        hands = []
        bots = []
        showOutcome = false
        hint = nil
        refresh()
        runningCount = state.runningCount
        count = state.count
        cardsLeft = Int(state.cardsLeft)
        dealerLine = "Place your bets."
        history = game.rounds()
        log = game.log()
        if let edgeCurve { game.setEdgeCurve(curve: edgeCurve) }
        refreshExactEdge()
    }

    func update(settings newSettings: AppSettings) {
        settings = newSettings
    }

    func setEdgeCurve(_ curve: EdgeCurve) {
        edgeCurve = curve
        edgeProfile = EdgeProfile(curve: curve)
        game.setEdgeCurve(curve: curve)
        refresh()
    }

    // MARK: - Derived

    var phase: Phase { state.phase }
    var canBet: Bool { !busy && (state.phase == .betting || state.phase == .settled) }
    var canAct: Bool { !busy && state.phase == .player }
    var legal: LegalActions { state.legal ?? LegalActions(hit: false, stand: false, double: false, split: false, surrender: false) }
    var activeHand: Int { Int(state.active) }
    var decksLeft: Double { Double(cardsLeft) / 52 }

    func stake(_ spot: BetSpot) -> Double {
        if let i = spot.sideIndex { return state.sideStakes.indices.contains(i) ? state.sideStakes[i] : 0 }
        return state.mainBet
    }

    /// Best total of the face-up cards.
    static func total(_ cards: [DCard]) -> (total: Int, soft: Bool) {
        handTotal(cards.filter(\.faceUp).map(\.card))
    }

    // MARK: - Betting

    func addChip(_ value: Double, to spot: BetSpot? = nil) {
        guard canBet else { return }
        let spot = spot ?? selectedSpot
        let now = stake(spot)
        setStake(spot, now + value)
        SoundPlayer.shared.chip()
        Haptics.chip()
    }

    func removeChip(_ value: Double, from spot: BetSpot? = nil) {
        guard canBet else { return }
        let spot = spot ?? selectedSpot
        setStake(spot, max(0, stake(spot) - value))
        Haptics.select()
    }

    func clear(_ spot: BetSpot) {
        guard canBet else { return }
        setStake(spot, 0)
        Haptics.select()
    }

    func clearAll() {
        guard canBet else { return }
        for s in BetSpot.allCases { setStake(s, 0) }
        Haptics.select()
    }

    private func setStake(_ spot: BetSpot, _ amount: Double) {
        if let bet = spot.sideBet {
            game.setSideStake(bet: bet, amount: amount)
        } else {
            game.setBet(amount: amount)
        }
        refresh()
    }

    // MARK: - Commands

    func deal() {
        guard canBet else { return }
        guard state.mainBet >= settings.table.minBet else {
            Haptics.warning()
            say("Table minimum is \(Fmt.money(settings.table.minBet)).")
            return
        }
        busy = true
        hint = nil
        Task {
            await collect()
            if game.deal() {
                showOutcome = false
                await play(game.takeEvents())
            }
            finishCommand()
        }
    }

    func act(_ action: Action) {
        guard canAct else { return }
        busy = true
        hint = nil
        Task {
            if game.act(action: action) {
                refresh()
                gradeFeedback()
                await play(game.takeEvents())
            }
            finishCommand()
        }
    }

    func insurance(_ take: Bool) {
        guard !busy, state.phase == .insurance else { return }
        busy = true
        Task {
            game.takeInsurance(take: take)
            refresh()
            gradeFeedback()
            await play(game.takeEvents())
            finishCommand()
        }
    }

    func newShoe() {
        guard canBet else { return }
        busy = true
        Task {
            await collect()
            game.newShoe()
            await play(game.takeEvents())
            finishCommand()
        }
    }

    func showHint() {
        hint = game.advice()
        Haptics.tap()
    }

    func pause() { game.pause(); refresh() }
    func resume() { game.resume(); refresh() }

    func resetSession(bankroll: Double) {
        game.resetSession(bankroll: bankroll)
        refresh()
        history = []
        log = []
    }

    // MARK: - Playback

    private func finishCommand() {
        refresh()
        runningCount = state.runningCount
        count = state.count
        cardsLeft = Int(state.cardsLeft)
        busy = false
        updateDealerLine()
        log = game.log()
        if state.phase == .settled {
            history = game.rounds()
            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) { showOutcome = true }
            settleFeedback()
            onRoundSettled?()
        }
        if state.phase == .betting || state.phase == .settled {
            refreshExactEdge()
        }
    }

    private func refresh() {
        state = game.state()
    }

    private var pace: Double { settings.dealSpeed.pace }

    private func sleep(_ seconds: Double) async {
        guard seconds > 0 else { return }
        try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
    }

    /// Sweep the last round's cards into the discard tray.
    private func collect() async {
        guard !dealer.isEmpty || !hands.isEmpty || !bots.isEmpty else { return }
        withAnimation(.easeIn(duration: pace > 0 ? 0.35 : 0.01)) { collecting = true }
        await sleep(pace > 0 ? 0.38 : 0)
        dealer = []
        hands = []
        bots = []
        collecting = false
        showOutcome = false
    }

    private func newCard(_ c: PlayingCard, faceUp: Bool) -> DCard {
        defer { nextID += 1 }
        return DCard(id: nextID, card: c, faceUp: faceUp)
    }

    private func newHand(_ cards: [DCard] = []) -> DHand {
        defer { nextID += 1 }
        return DHand(id: nextID, cards: cards)
    }

    private func play(_ events: [TableEvent]) async {
        let spring = Animation.spring(response: 0.42, dampingFraction: 0.84)
        for e in events {
            switch e {
            case let .shuffle(rc, c):
                runningCount = rc
                count = c
                cardsLeft = Int(state.shoeSize)
                shuffleTick += 1
                SoundPlayer.shared.shuffle()
                Haptics.shuffle()
                say("Shuffling up.")
                await sleep(pace > 0 ? 0.9 : 0)

            case let .card(seat, hand, card, faceUp, rc, c, left):
                let dc = newCard(card, faceUp: faceUp)
                withAnimation(spring) {
                    switch seat {
                    case .dealer:
                        dealer.append(dc)
                    case .player:
                        while hands.count <= Int(hand) { hands.append(newHand()) }
                        hands[Int(hand)].cards.append(dc)
                    case let .bot(index):
                        let b = Int(index)
                        while bots.count <= b { bots.append([]) }
                        while bots[b].count <= Int(hand) { bots[b].append(newHand()) }
                        bots[b][Int(hand)].cards.append(dc)
                    }
                    runningCount = rc
                    count = c
                    cardsLeft = Int(left)
                }
                SoundPlayer.shared.card()
                if seat == .player { Haptics.card() }
                await sleep(pace)

            case let .split(seat, hand):
                withAnimation(spring) {
                    switch seat {
                    case .player:
                        let h = Int(hand)
                        if hands.indices.contains(h), hands[h].cards.count >= 2 {
                            let second = hands[h].cards.removeLast()
                            hands.insert(newHand([second]), at: h + 1)
                        }
                    case let .bot(index):
                        let b = Int(index), h = Int(hand)
                        if bots.indices.contains(b), bots[b].indices.contains(h), bots[b][h].cards.count >= 2 {
                            let second = bots[b][h].cards.removeLast()
                            bots[b].insert(newHand([second]), at: h + 1)
                        }
                    case .dealer:
                        break
                    }
                }
                SoundPlayer.shared.chip()
                await sleep(pace * 0.7)

            case let .holeRevealed(_, rc, c):
                withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
                    if dealer.count > 1 { dealer[1].faceUp = true }
                    runningCount = rc
                    count = c
                }
                SoundPlayer.shared.flip()
                await sleep(pace * 1.1)

            case .settled:
                break
            }
        }
    }

    // MARK: - Feedback

    private func gradeFeedback() {
        guard let d = state.lastDecision else { return }
        if d.correct {
            Haptics.tap()
        } else {
            Haptics.warning()
            SoundPlayer.shared.mistake()
            mistakeTask?.cancel()
            withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { mistake = d }
            mistakeTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 3_200_000_000)
                guard !Task.isCancelled else { return }
                withAnimation(.easeOut(duration: 0.3)) { self?.mistake = nil }
            }
        }
    }

    func dismissMistake() {
        withAnimation(.easeOut(duration: 0.2)) { mistake = nil }
    }

    private func settleFeedback() {
        let net = state.roundNet
        let blackjack = state.hands.contains { $0.outcome == .blackjack }
        if blackjack {
            SoundPlayer.shared.blackjack()
            Haptics.success()
        } else if net > 0 {
            SoundPlayer.shared.win()
            Haptics.success()
        } else if net < 0 {
            SoundPlayer.shared.chip(after: 0.1)
        }
    }

    private func say(_ line: String) {
        dealerLine = line
        dealerLineID += 1
    }

    private func updateDealerLine() {
        let s = state
        switch s.phase {
        case .betting:
            say(s.justShuffled ? "Fresh shoe. Place your bets." : "Place your bets.")
        case .insurance:
            say("Insurance?")
        case .player:
            guard s.hands.indices.contains(activeHand), let up = s.dealer.first else { return }
            let h = s.hands[activeHand]
            let label = h.soft ? "soft \(h.total)" : "\(h.total)"
            say("\(label.prefix(1).uppercased() + label.dropFirst()) against \(Self.article(up)).")
        case .settled:
            let d = s.dealer
            let dealerBJ = d.count == 2 && s.dealerTotal == 21
            var line: String
            if dealerBJ {
                line = "Dealer has blackjack."
            } else if s.dealerTotal > 21 {
                line = "Dealer busts."
            } else if s.hands.allSatisfy({ $0.outcome == .bust || $0.outcome == .surrender }) {
                line = s.hands.first?.outcome == .surrender ? "Surrendered." : "Too many."
            } else if s.hands.first?.outcome == .blackjack {
                line = "Blackjack!"
            } else {
                line = "Dealer has \(s.dealerTotal)."
            }
            if s.roundNet > 0 { line += " You win \(Fmt.money(s.roundNet))." }
            else if s.roundNet < 0 { line += " You lose \(Fmt.money(-s.roundNet))." }
            else if !s.hands.isEmpty { line += " Push." }
            say(line)
        }
    }

    private static func article(_ c: PlayingCard) -> String {
        switch c.rank {
        case 1: return "an ace"
        case 8: return "an eight"
        case 11, 12, 13, 10: return "a ten"
        default: return "a \(c.value)"
        }
    }

    // MARK: - Edge

    private func refreshExactEdge() {
        let g = game
        Task.detached(priority: .utility) { [weak self] in
            let e = g.exactEdge()
            await MainActor.run { self?.exactEdge = e }
        }
    }

    /// Edge at the count the player sees, from the simulated curve (or the engine's estimate).
    var estimatedEdge: Double {
        guard let curve = edgeCurve else { return state.estimatedEdge }
        return EdgeMath.edge(curve, at: count)
    }
}

/// Edge-curve lookups shared by the gauge and the table.
enum EdgeMath {
    static func edge(_ curve: EdgeCurve, at count: Double) -> Double {
        curveEdge(curve: curve, count: count)
    }

    static func band(_ curve: EdgeCurve, at count: Double) -> (low: Double, high: Double)? {
        curveBand(curve: curve, count: count).map { (low: $0.low, high: $0.high) }
    }
}
