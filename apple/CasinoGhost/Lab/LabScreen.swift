import SwiftUI
import Charts
import CasinoGhostCore

enum LabSection: String, CaseIterable, Identifiable {
    case simulator, indices, sideBets
    var id: String { rawValue }
    var title: String {
        switch self {
        case .simulator: return "Simulator"
        case .indices: return "Indices"
        case .sideBets: return "Side bets"
        }
    }
}

struct LabScreen: View {
    @Environment(AppModel.self) private var app
    @State private var section: LabSection = .simulator
    @State private var sim = SimLabModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    Picker("Section", selection: $section) {
                        ForEach(LabSection.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    GameSummary()
                    switch section {
                    case .simulator: SimulatorLab(model: sim)
                    case .indices: IndexLab()
                    case .sideBets: SideBetLab()
                    }
                }
                .padding(16)
                .frame(maxWidth: 900)
                .frame(maxWidth: .infinity)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Lab")
        }
        .task {
            if app.screenshot == "lab", sim.report == nil {
                sim.rounds = 2_000_000
                sim.run(app.settings, plays: app.activePlays)
            }
        }
    }
}

/// The game being analysed (the table's settings).
struct GameSummary: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        let s = app.settings
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(s.rules.shorthand).font(.subheadline.monospaced().weight(.semibold))
                Text("\(s.count.name) · \(s.trueCount.rounding.label) · decks to \(deckLabel(s.trueCount.deckResolution)) · \(s.indexMode.label) · \(s.table.otherPlayers) other player\(s.table.otherPlayers == 1 ? "" : "s")")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button("Change") { app.tab = .rules }.font(.caption.weight(.semibold))
        }
        .padding(12)
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.line))
    }
}

func deckLabel(_ r: Double) -> String {
    switch r {
    case 0: return "the card"
    case 0.25: return "quarter decks"
    case 0.5: return "half decks"
    default: return "whole decks"
    }
}

// MARK: - Simulator

@MainActor
@Observable
final class SimLabModel {
    var rounds: UInt64 = 5_000_000
    private(set) var progress: Double?
    private(set) var report: SimulationReport?
    private var job: ProgressHandle?

    // bet plan
    var spread: Double = 8
    var customPlan: BetPlan?
    var wongFrom: Double? = nil
    var bankroll: Double = 10_000
    var tripHours: Double = 10
    var targetRor: Double = 0.05
    private(set) var optimized: OptimizedPlan?

    func run(_ s: AppSettings, plays: (plays: [IndexEntry], insurance: Double?)) {
        job?.cancel()
        let handle = ProgressHandle()
        job = handle
        progress = 0
        optimized = nil
        let setup = AnalysisStore.setup(s, plays: plays.plays, insurance: plays.insurance, rounds: rounds, seed: UInt64.random(in: 1...UInt64.max / 2))
        Task {
            let r = await Jobs.run(handle, report: { [weak self] p in
                if self?.job === handle { self?.progress = p }
            }) {
                simulate(setup: setup, progress: handle)
            }
            guard self.job === handle else { return }
            self.report = r
            self.progress = nil
            Haptics.success()
        }
    }

    func cancel() {
        job?.cancel()
    }

    func plan(unit: Double) -> BetPlan {
        var p = customPlan ?? spreadPlan(maxUnits: spread, unit: unit)
        p.unit = unit
        p.playFrom = wongFrom
        return p
    }

    func optimize(_ s: AppSettings) {
        guard let report else { return }
        optimized = optimizePlan(report: report, setup: OptimizeSetup(
            bankroll: bankroll, targetRor: targetRor, minBet: s.table.minBet, maxBet: s.table.maxBet,
            increment: s.table.minBet >= 25 ? 5 : 1, maxSpread: spread, wongOut: wongFrom != nil, roundsPerHour: s.table.roundsPerHour))
    }
}

struct SimulatorLab: View {
    @Environment(AppModel.self) private var app
    @Bindable var model: SimLabModel

    var body: some View {
        VStack(spacing: 14) {
            Panel(title: "Simulation", systemImage: "cpu") {
                Text("Deals real shoes card by card at a table with \(app.settings.table.otherPlayers) other player\(app.settings.table.otherPlayers == 1 ? "" : "s"), counting with \(app.settings.count.name) and playing basic strategy plus your index plays. Results are tallied by the count at each bet, so any bet plan can then be evaluated exactly.")
                    .font(.caption).foregroundStyle(.secondary)
                Picker("Rounds", selection: $model.rounds) {
                    Text("1M").tag(UInt64(1_000_000))
                    Text("5M").tag(UInt64(5_000_000))
                    Text("20M").tag(UInt64(20_000_000))
                    Text("100M").tag(UInt64(100_000_000))
                }
                .pickerStyle(.segmented)
                if let p = model.progress {
                    HStack {
                        ProgressView(value: p).tint(Theme.brass)
                        Text("\(Int(p * 100))%").font(.data(12)).frame(width: 40)
                        Button("Stop") { model.cancel() }.font(.caption.weight(.semibold))
                    }
                } else {
                    Button {
                        model.run(app.settings, plays: app.activePlays)
                    } label: {
                        Label("Run \(Fmt.rounds(model.rounds)) rounds", systemImage: "play.fill").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(BrassButtonStyle())
                }
            }
            if let r = model.report {
                SimResults(report: r)
                BetPlanPanel(model: model, report: r)
            }
        }
    }
}

struct SimResults: View {
    @Environment(AppModel.self) private var app
    let report: SimulationReport

    var body: some View {
        let label = app.settings.countLabel
        let rows = report.rows.filter { $0.freq > 0.0004 && abs($0.count) <= 12 }
        Panel(title: "Results", systemImage: "chart.bar") {
            HStack {
                big("Flat-bet EV", Fmt.pct(report.ev, digits: 3), sub: "± \(Fmt.pct(1.96 * report.se, digits: 3, signed: false))")
                big("SD per round", String(format: "%.3f", report.sd), sub: "units")
                big("Rounds", Fmt.rounds(report.rounds), sub: String(format: "%.1fs · %@/s", report.elapsedSecs, Fmt.rounds(UInt64(Double(report.rounds) / max(report.elapsedSecs, 0.001)))))
            }
            Text("EDGE BY \(label)").font(.caption2.weight(.semibold)).tracking(1).foregroundStyle(Theme.muted)
            Chart {
                ForEach(rows, id: \.count) { r in
                    BarMark(x: .value(label, Int(r.count)), y: .value("Edge", r.ev * 100))
                        .foregroundStyle(r.ev > 0 ? Theme.good : Theme.bad)
                    RuleMark(x: .value(label, Int(r.count)), yStart: .value("Low", (r.ev - 1.96 * r.se) * 100), yEnd: .value("High", (r.ev + 1.96 * r.se) * 100))
                        .foregroundStyle(Theme.fg.opacity(0.6))
                        .lineStyle(StrokeStyle(lineWidth: 1))
                }
                RuleMark(y: .value("Zero", 0)).foregroundStyle(Theme.fg2.opacity(0.5))
            }
            .chartYAxisLabel("%")
            .frame(height: 200)
            Text("HOW OFTEN EACH \(label) COMES UP").font(.caption2.weight(.semibold)).tracking(1).foregroundStyle(Theme.muted)
            Chart(rows, id: \.count) { r in
                BarMark(x: .value(label, Int(r.count)), y: .value("Share", r.freq * 100))
                    .foregroundStyle(Theme.brass.opacity(0.8))
            }
            .chartYAxisLabel("%")
            .frame(height: 110)
            HStack(spacing: 14) {
                mini("Blackjacks", report.blackjacks)
                mini("Doubles", report.doubles)
                mini("Splits", report.splits)
                mini("Index plays", report.deviations)
                mini("Insured", report.insurances)
            }
        }
    }

    private func big(_ t: String, _ v: String, sub: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(t.uppercased()).font(.system(size: 9, weight: .semibold)).tracking(1).foregroundStyle(Theme.muted)
            Text(v).font(.data(18, weight: .bold))
            Text(sub).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func mini(_ t: String, _ n: UInt64) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(t).font(.system(size: 9, weight: .semibold)).foregroundStyle(Theme.muted)
            Text(String(format: "%.2f%%", Double(n) / Double(max(report.rounds, 1)) * 100)).font(.data(12))
        }
    }
}

struct BetPlanPanel: View {
    @Environment(AppModel.self) private var app
    @Bindable var model: SimLabModel
    let report: SimulationReport

    var body: some View {
        let s = app.settings
        let plan = model.plan(unit: s.table.minBet)
        let risk = evaluatePlan(report: report, plan: plan, setup: RiskSetup(bankroll: model.bankroll, roundsPerHour: s.table.roundsPerHour, tripHours: model.tripHours))
        VStack(spacing: 14) {
            Panel(title: "Bet plan", systemImage: "chart.line.uptrend.xyaxis") {
                Picker("Spread", selection: $model.spread) {
                    ForEach([1.0, 4, 8, 12, 16, 20], id: \.self) { v in Text(v == 1 ? "Flat" : "1–\(Int(v))").tag(v) }
                }
                .pickerStyle(.segmented)
                .onChange(of: model.spread) { _, _ in model.customPlan = nil }
                PlanSteps(plan: plan, label: s.countLabel)
                Toggle(isOn: Binding(get: { model.wongFrom != nil }, set: { model.wongFrom = $0 ? 1 : nil })) {
                    Text("Back-count: sit out below \(s.countLabel) \(Fmt.count(model.wongFrom ?? 1))").font(.subheadline)
                }
                if model.wongFrom != nil {
                    Stepper("Enter at \(s.countLabel) \(Fmt.count(model.wongFrom ?? 1))", value: Binding(get: { model.wongFrom ?? 1 }, set: { model.wongFrom = $0 }), in: -2...6)
                        .font(.subheadline)
                }
                HStack {
                    money("Bankroll", $model.bankroll)
                    VStack(alignment: .leading) {
                        Text("Trip hours").font(.caption).foregroundStyle(.secondary)
                        Stepper("\(Int(model.tripHours)) h", value: $model.tripHours, in: 1...200).font(.subheadline)
                    }
                }
            }
            RiskReportView(risk: risk)
            Panel(title: "Optimise", systemImage: "wand.and.stars") {
                Text("Finds the bets at each count that maximise your hourly win while keeping the risk of ruin at or below the target, within the table limits and your spread.")
                    .font(.caption).foregroundStyle(.secondary)
                Picker("Target risk of ruin", selection: $model.targetRor) {
                    Text("1%").tag(0.01)
                    Text("5%").tag(0.05)
                    Text("13.5%").tag(0.135)
                }
                .pickerStyle(.segmented)
                Button {
                    model.optimize(s)
                    Haptics.success()
                } label: {
                    Label("Find the best plan", systemImage: "sparkles").frame(maxWidth: .infinity)
                }
                .buttonStyle(BrassButtonStyle())
                if let o = model.optimized {
                    if !o.feasible {
                        Text("No plan reaches that risk with this bankroll; showing the safest one found.")
                            .font(.caption).foregroundStyle(Theme.warn)
                    }
                    PlanSteps(plan: o.plan, label: s.countLabel)
                    HStack {
                        tile("Win / hour", Fmt.money(o.report.winPerHour))
                        tile("Risk of ruin", Fmt.pct(o.report.ror, digits: 1, signed: false))
                        tile("SCORE", String(format: "%.1f", o.report.score))
                    }
                    Button("Use this plan") {
                        var p = o.plan
                        p.unit = s.table.minBet
                        model.customPlan = p
                        model.wongFrom = o.plan.playFrom
                    }
                    .buttonStyle(GhostButtonStyle())
                }
            }
        }
    }

    private func money(_ title: String, _ value: Binding<Double>) -> some View {
        VStack(alignment: .leading) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            TextField(title, value: value, format: .currency(code: "USD").precision(.fractionLength(0)))
                .keyboardType(.numberPad)
                .font(.data(16))
                .textFieldStyle(.roundedBorder)
        }
    }

    private func tile(_ t: String, _ v: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(t.uppercased()).font(.system(size: 9, weight: .semibold)).tracking(1).foregroundStyle(Theme.muted)
            Text(v).font(.data(15, weight: .bold))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// "TC ≤ 1: $25 · 2: $50 · 3: $100 …"
struct PlanSteps: View {
    let plan: BetPlan
    let label: String

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                if let w = plan.playFrom {
                    step("< \(Fmt.count(w))", "sit out")
                }
                ForEach(Array(plan.steps.enumerated()), id: \.offset) { i, st in
                    let c = i == 0 ? (plan.steps.count > 1 ? "≤ \(Fmt.count(plan.steps[1].count - 1))" : "any") : Fmt.count(st.count) + (i == plan.steps.count - 1 ? "+" : "")
                    step(c, Fmt.money(st.units * plan.unit))
                }
            }
        }
    }

    private func step(_ c: String, _ v: String) -> some View {
        VStack(spacing: 1) {
            Text("\(label) \(c)").font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
            Text(v).font(.data(13, weight: .bold))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Theme.panel2, in: RoundedRectangle(cornerRadius: 10))
    }
}

struct RiskReportView: View {
    let risk: RiskReport

    var body: some View {
        let rows: [(String, String, String)] = [
            ("Win per hour", Fmt.money(risk.winPerHour), "SD \(Fmt.money(risk.sdPerHour))"),
            ("Win per 100 rounds", Fmt.money(risk.winPer100), "SD \(Fmt.money(risk.sdPer100))"),
            ("Average bet", Fmt.money(risk.avgBet), "\(Fmt.pct(risk.playFraction, digits: 0, signed: false)) of rounds played"),
            ("Edge on action", Fmt.pct(risk.edgeOnAction, digits: 2), "win ÷ money bet"),
            ("Risk of ruin", Fmt.pct(risk.ror, digits: 1, signed: false), "for this bankroll, ever"),
            ("Trip risk of ruin", Fmt.pct(risk.tripRor, digits: 1, signed: false), "\(Fmt.pct(risk.pAheadTrip, digits: 0, signed: false)) chance to be ahead"),
            ("N0", risk.n0Hours.isFinite ? "\(Fmt.number(risk.n0Hours)) h" : "—", risk.n0Rounds.isFinite ? "\(Fmt.number(risk.n0Rounds)) rounds" : "never ahead"),
            ("DI / SCORE", String(format: "%.2f / %.1f", risk.di, risk.score), "SCORE: $ per 100 rounds on $10k"),
            ("Bankroll for 5% risk", risk.bankroll5.isFinite ? Fmt.money(risk.bankroll5) : "—", risk.bankroll1.isFinite ? "1%: \(Fmt.money(risk.bankroll1))" : ""),
        ]
        Panel(title: "Win rate and risk", systemImage: "shield.lefthalf.filled") {
            Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 9) {
                ForEach(Array(rows.enumerated()), id: \.offset) { _, r in
                    GridRow {
                        Text(r.0).font(.subheadline)
                        Text(r.1).font(.data(15, weight: .bold)).gridColumnAlignment(.trailing)
                        Text(r.2).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }
}

// MARK: - Indices

struct IndexLab: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        let s = app.settings
        let report = app.analysis.cachedIndices(for: s)
        VStack(spacing: 14) {
            Panel(title: "Generate indices", systemImage: "function") {
                Text("Simulates shoes, collects the real compositions you meet at each \(s.countLabel), and computes every action's exact value for every hand and upcard. An index is where the best play changes, at the count you see when you decide.")
                    .font(.caption).foregroundStyle(.secondary)
                if let p = app.analysis.indexProgress {
                    HStack {
                        ProgressView(value: p).tint(Theme.brass)
                        Text("\(Int(p * 100))%").font(.data(12)).frame(width: 40)
                        Button("Stop") { app.analysis.cancelIndices() }.font(.caption.weight(.semibold))
                    }
                } else {
                    Button {
                        app.analysis.generateIndices(s) { _ in Haptics.success() }
                    } label: {
                        Label(report == nil ? "Generate for \(s.count.name)" : "Generate again", systemImage: "sparkles").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(BrassButtonStyle())
                }
            }
            if let report {
                IndexTable(report: report, published: s.countId == "hilo" ? publishedIndices(rules: s.rules, set: .full) : [])
                if s.indexMode != .generated {
                    Button("Use these indices at the table") { app.useGeneratedIndices() }
                        .buttonStyle(GhostButtonStyle())
                } else {
                    Label("The table is using these indices.", systemImage: "checkmark.circle.fill").foregroundStyle(Theme.good).font(.subheadline)
                }
            }
        }
    }
}

struct IndexTable: View {
    @Environment(AppModel.self) private var app
    let report: IndexReport
    let published: [IndexEntry]

    var body: some View {
        let label = app.settings.countLabel
        Panel(title: "Most valuable plays", systemImage: "list.number") {
            if let ins = report.insurance {
                HStack {
                    Text("Insurance").font(.subheadline.weight(.semibold))
                    Spacer()
                    Text("Take at \(label) \(Fmt.count(ins))").font(.data(13, weight: .bold))
                }
            }
            ForEach(Array(report.indices.prefix(40).enumerated()), id: \.offset) { _, g in
                let p = g.play
                let move = p.baseBelow ? p.above : p.below
                let pub = published.first { $0.kind == p.kind && $0.key == p.key && $0.up == p.up && $0.above == p.above && $0.baseBelow == p.baseBelow }
                HStack(spacing: 8) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(p.label).font(.subheadline.weight(.semibold))
                        Text("\(move.label) \(p.baseBelow ? "at" : "below") \(label) \(Fmt.count(p.index))")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 1) {
                        Text(Fmt.count(p.index)).font(.data(16, weight: .bold))
                        if let pub {
                            Text("published \(Fmt.count(pub.index))").font(.caption2).foregroundStyle(pub.index == p.index ? Theme.good : Theme.warn)
                        } else {
                            Text(String(format: "%.3f/100", g.gainPer100)).font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
                        }
                    }
                }
                Divider()
            }
        }
    }
}

// MARK: - Side bets

struct SideBetLab: View {
    @Environment(AppModel.self) private var app
    @State private var bet: SideBetKind = .twentyOnePlusThree
    @State private var level: Int32 = 2
    @State private var decks: UInt32 = 6
    @State private var countResult: SideCountReport?
    @State private var running = false

    private var info: SideBetInfo? { sideBets().first { $0.bet == bet } }
    private var index: Int { [SideBetKind.perfectPairs, .twentyOnePlusThree, .luckyLadies].firstIndex(of: bet) ?? 0 }

    var body: some View {
        let pays = app.settings.pays.indices.contains(index) ? app.settings.pays[index] : (info?.presets.first?.pays ?? [])
        let a = analyzeSideBet(bet: bet, decks: decks, pays: pays, countLevel: level)
        VStack(spacing: 14) {
            Picker("Side bet", selection: $bet) {
                Text("Perfect Pairs").tag(SideBetKind.perfectPairs)
                Text("21+3").tag(SideBetKind.twentyOnePlusThree)
                Text("Lucky Ladies").tag(SideBetKind.luckyLadies)
            }
            .pickerStyle(.segmented)
            .onChange(of: bet) { _, _ in countResult = nil }
            if let info {
                Panel(title: info.name, systemImage: "suit.club") {
                    Text(info.blurb).font(.caption).foregroundStyle(.secondary)
                    Menu {
                        ForEach(info.presets, id: \.name) { p in
                            Button(p.name) { setPays(p.pays) }
                        }
                    } label: {
                        Label("Paytable: \(pays.map { String(Int($0)) }.joined(separator: " / "))", systemImage: "list.bullet")
                    }
                    Stepper("\(decks) deck\(decks == 1 ? "" : "s")", value: $decks, in: 1...8).font(.subheadline)
                    Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 6) {
                        GridRow {
                            Text("OUTCOME").font(.caption2.weight(.semibold)).foregroundStyle(Theme.muted)
                            Text("PAYS").font(.caption2.weight(.semibold)).foregroundStyle(Theme.muted)
                            Text("CHANCE").font(.caption2.weight(.semibold)).foregroundStyle(Theme.muted)
                        }
                        ForEach(Array(info.outcomes.enumerated()), id: \.offset) { i, o in
                            GridRow {
                                Text(o.label).font(.caption)
                                Text("\(Int(pays.indices.contains(i) ? pays[i] : 0)):1").font(.data(12))
                                Text(a.probs.indices.contains(i) && a.probs[i] > 0 ? "1 in \(Fmt.number(1 / a.probs[i]))" : "—").font(.data(12))
                            }
                        }
                    }
                    HStack {
                        stat("House edge", Fmt.pct(-a.ev, digits: 2, signed: false))
                        stat("SD", String(format: "%.2f", a.sd))
                        stat("Countable", a.countable ? "Yes" : "No")
                    }
                }
                Panel(title: "Effect of removing one card", systemImage: "chart.bar.xaxis") {
                    Chart {
                        ForEach(Array(a.effects.enumerated()), id: \.offset) { i, e in
                            BarMark(x: .value("Card", i == 0 ? "A" : i == 9 ? "10" : String(i + 1)), y: .value("Effect", e * 100))
                                .foregroundStyle(e >= 0 ? Theme.info : Theme.bad)
                        }
                    }
                    .frame(height: 150)
                    if a.countable {
                        HStack {
                            Text("Derived count, level").font(.caption)
                            Picker("Level", selection: $level) {
                                Text("1").tag(Int32(1))
                                Text("2").tag(Int32(2))
                                Text("3").tag(Int32(3))
                            }
                            .pickerStyle(.segmented)
                            .frame(width: 140)
                        }
                        HStack(spacing: 4) {
                            ForEach(Array(a.tags.enumerated()), id: \.offset) { i, t in
                                VStack(spacing: 1) {
                                    Text(i == 0 ? "A" : String(i + 1)).font(.caption2).foregroundStyle(.secondary)
                                    Text(t > 0 ? "+\(t)" : "\(t)").font(.data(13, weight: .bold))
                                }
                                .frame(maxWidth: .infinity)
                            }
                        }
                        Button {
                            runCount(tags: a.tags, pays: pays)
                        } label: {
                            Label(running ? "Simulating…" : "Simulate this count", systemImage: "play.fill").frame(maxWidth: .infinity)
                        }
                        .buttonStyle(BrassButtonStyle())
                        .disabled(running)
                        if let r = countResult { SideCountResultView(result: r) }
                    } else {
                        Text("Every rank affects this bet the same way, so no card count tracks it.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private func stat(_ t: String, _ v: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(t.uppercased()).font(.system(size: 9, weight: .semibold)).tracking(1).foregroundStyle(Theme.muted)
            Text(v).font(.data(16, weight: .bold))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func setPays(_ p: [Double]) {
        let i = index
        app.update { s in
            while s.pays.count <= i { s.pays.append([]) }
            s.pays[i] = p
        }
        countResult = nil
    }

    private func runCount(tags: [Int32], pays: [Double]) {
        running = true
        let setup = SideCountSetup(bet: bet, pays: pays, decks: decks, penetration: app.settings.rules.penetration,
                                   seats: app.settings.table.otherPlayers + 1, tags: tags, shoes: 20_000, seed: 11)
        Task {
            let r = await Task.detached(priority: .userInitiated) { simulateSideCount(setup: setup) }.value
            countResult = r
            running = false
            Haptics.success()
        }
    }
}

struct SideCountResultView: View {
    let result: SideCountReport

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let t = result.threshold {
                Text("Bet at true count \(Fmt.count(Double(t))) or higher: \(Fmt.pct(result.playFreq, digits: 1, signed: false)) of rounds, averaging \(Fmt.pct(result.evWhenPlaying)) per bet.")
                    .font(.subheadline)
                Text("Worth \(String(format: "%.2f", result.gainPer100)) units per 100 rounds (perfect knowledge of the shoe: \(String(format: "%.2f", result.perfectGainPer100))).")
                    .font(.caption).foregroundStyle(.secondary)
            } else {
                Text("This count never makes the bet positive often enough to play.").font(.subheadline)
            }
            Chart(result.bins.filter { $0.rounds > result.rounds / 2000 }, id: \.tc) { b in
                LineMark(x: .value("TC", Int(b.tc)), y: .value("EV", b.meanEv * 100))
                    .foregroundStyle(Theme.brass)
                RuleMark(y: .value("Zero", 0)).foregroundStyle(Theme.fg2.opacity(0.4))
            }
            .frame(height: 140)
        }
    }
}
