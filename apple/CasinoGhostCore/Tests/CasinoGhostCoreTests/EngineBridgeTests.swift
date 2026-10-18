import XCTest
@testable import CasinoGhostCore

/// Calls across the Rust boundary: the numbers must match what the engine's own tests check.
final class EngineBridgeTests: XCTestCase {
    func testHouseEdgeAndStrategyChart() {
        let rules = defaultRules()
        XCTAssertEqual(houseEdge(rules: rules), 0.0040, accuracy: 0.0002)
        let chart = strategyChart(rules: rules)
        let hard16 = chart.hard.first { $0.label == "16" }
        XCTAssertEqual(hard16?.codes, ["S", "S", "S", "S", "S", "H", "H", "H", "H", "H"])
    }

    func testParsingAndPresets() {
        let parsed = parseRules(text: "8D H17 LS 6:5", rules: defaultRules(), table: defaultTable())
        XCTAssertEqual(parsed.rules.decks, 8)
        XCTAssertTrue(parsed.rules.h17)
        XCTAssertEqual(parsed.rules.surrender, .late)
        XCTAssertEqual(parsed.rules.bjPays, 1.2, accuracy: 1e-9)
        XCTAssertFalse(gamePresets().isEmpty)
        XCTAssertTrue(countingSystems().contains { $0.id == "hilo" })
    }

    func testTablePlaysARound() throws {
        let hilo = try XCTUnwrap(countingSystems().first { $0.id == "hilo" })
        let config = TableConfig(
            rules: defaultRules(), count: hilo, trueCount: defaultTrueCountRule(),
            plays: publishedIndices(rules: defaultRules(), set: .i18), insuranceIndex: hiloInsuranceIndex(),
            useIndices: true, pays: sideBets().map { $0.presets[0].pays }, minBet: 5, maxBet: 500, bots: 1)
        let table = TableGame(config: config, session: nil, bankroll: 1000, seed: 7)
        XCTAssertTrue(table.deal())
        var guardCount = 0
        while true {
            let s = table.state()
            if s.phase == .insurance { table.takeInsurance(take: false); continue }
            guard s.phase == .player, let advice = table.advice() else { break }
            XCTAssertTrue(table.act(action: advice.action))
            guardCount += 1
            XCTAssertLessThan(guardCount, 30)
        }
        let s = table.state()
        XCTAssertEqual(s.phase, .settled)
        XCTAssertFalse(table.takeEvents().isEmpty)
        XCTAssertEqual(s.stats.correct, s.stats.decisions)
        // the session round-trips
        let again = TableGame(config: config, session: table.snapshot(), bankroll: 0, seed: nil)
        XCTAssertEqual(again.state().bankroll, s.bankroll, accuracy: 1e-9)
        XCTAssertEqual(again.state().dealt, s.dealt)
    }

    func testSimulationRuns() {
        let hilo = countingSystems()[0]
        let setup = SimulationSetup(
            rules: defaultRules(), table: defaultTable(), count: hilo, trueCount: defaultTrueCountRule(),
            plays: [], insuranceIndex: nil, rounds: 200_000, seed: 1)
        let report = simulate(setup: setup, progress: ProgressHandle())
        XCTAssertEqual(report.rounds, 200_000)
        XCTAssertLessThan(report.ev, 0.01)
        let risk = evaluatePlan(report: report, plan: spreadPlan(maxUnits: 8, unit: 25),
                                setup: RiskSetup(bankroll: 10_000, roundsPerHour: 100, tripHours: 10))
        XCTAssertGreaterThan(risk.sdRound, 0)
    }

    func testEdgeCurve() {
        let hilo = countingSystems()[0]
        let setup = SimulationSetup(
            rules: defaultRules(), table: defaultTable(), count: hilo, trueCount: defaultTrueCountRule(),
            plays: publishedIndices(rules: defaultRules(), set: .i18Fab4), insuranceIndex: hiloInsuranceIndex(),
            rounds: 1_000_000, seed: 2)
        let curve = buildEdgeCurve(setup: setup, spreadPerCount: 8, progress: ProgressHandle())
        XCTAssertEqual(curve.coefficients.count, 4)
        XCTAssertLessThan(curveEdge(curve: curve, count: -2), curveEdge(curve: curve, count: 0))
        XCTAssertLessThan(curveEdge(curve: curve, count: 0), curveEdge(curve: curve, count: 3))
        XCTAssertEqual(curveEdge(curve: curve, count: curve.breakEven), 0, accuracy: 1e-9)
        let band = curveBand(curve: curve, count: 2)
        XCTAssertNotNil(band)
        if let band { XCTAssertLessThan(band.low, band.high) }
    }
}
