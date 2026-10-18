import SwiftUI
import Charts
import CasinoGhostCore

/// Widgets beside or under the table.
struct DashboardView: View {
    let model: TableModel
    /// Two columns under a wide table (iPad in portrait), one beside it or on iPhone.
    var columns = 1

    var body: some View {
        if columns > 1 {
            VStack(spacing: 14) {
                EdgeGaugeCard(model: model, wide: true)
                HStack(alignment: .top, spacing: 14) {
                    VStack(spacing: 14) {
                        CountsCard(model: model)
                        ErrorsCard(model: model)
                        SessionCard(model: model)
                    }
                    VStack(spacing: 14) {
                        AccuracyCard(stats: model.state.stats)
                        SideBetsCard(model: model)
                        StatsCard(stats: model.state.stats, elapsedMs: model.state.elapsedMs)
                    }
                }
                LogCard(log: model.log)
            }
        } else {
            VStack(spacing: 14) {
                EdgeGaugeCard(model: model)
                CountsCard(model: model)
                AccuracyCard(stats: model.state.stats)
                ErrorsCard(model: model)
                SideBetsCard(model: model)
                SessionCard(model: model)
                StatsCard(stats: model.state.stats, elapsedMs: model.state.elapsedMs)
                LogCard(log: model.log)
            }
        }
    }
}

// MARK: - Counts

struct CountsCard: View {
    @Environment(AppModel.self) private var app
    let model: TableModel
    @State private var hidden = false

    var body: some View {
        let s = app.settings
        Panel(title: "\(s.count.name) count", systemImage: "number") {
            HStack(alignment: .firstTextBaseline) {
                metric("Running", Fmt.count(model.runningCount))
                if s.count.balanced { metric("True", s.trueCount.rounding == .exact ? String(format: "%+.1f", model.count) : Fmt.count(model.count)) }
                metric("Decks left", String(format: "%.1f", model.decksLeft))
            }
            .blur(radius: hidden ? 12 : 0)
            .overlay {
                if hidden {
                    Text("Keep the count yourself. Tap to check.")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }
            .contentShape(Rectangle())
            .onTapGesture { withAnimation(.easeInOut(duration: 0.2)) { hidden.toggle() } }
            Toggle("Practice: hide the count", isOn: $hidden)
                .font(.caption)
                .tint(Theme.brass)
        }
    }

    private func metric(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title.uppercased()).font(.system(size: 10, weight: .semibold)).tracking(1).foregroundStyle(Theme.muted)
            Text(value).font(.display(34, weight: .heavy)).contentTransition(.numericText()).animation(.snappy, value: value)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Accuracy

struct AccuracyCard: View {
    let stats: SessionStats

    var body: some View {
        let overall = stats.decisions == 0 ? nil : Double(stats.correct) / Double(stats.decisions)
        Panel(title: "Accuracy", systemImage: "checkmark.seal") {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(overall.map { Fmt.pct($0, digits: 1, signed: false) } ?? "—")
                    .font(.display(34, weight: .heavy))
                    .foregroundStyle(color(overall))
                Text("\(stats.correct) of \(stats.decisions) decisions").font(.caption).foregroundStyle(.secondary)
            }
            VStack(spacing: 6) {
                row("Hard totals", stats.hard)
                row("Soft totals", stats.soft)
                row("Pairs", stats.pair)
                row("Insurance", stats.insurance)
                row("Index plays", stats.index)
            }
        }
    }

    private func color(_ v: Double?) -> Color {
        guard let v else { return Theme.fg }
        return v >= 0.98 ? Theme.good : v >= 0.9 ? Theme.warn : Theme.bad
    }

    private func row(_ title: String, _ t: Tally) -> some View {
        let v = t.n == 0 ? nil : Double(t.ok) / Double(t.n)
        return HStack(spacing: 8) {
            Text(title).font(.caption).frame(width: 86, alignment: .leading)
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.panel2)
                    Capsule().fill(color(v)).frame(width: g.size.width * CGFloat(v ?? 0))
                }
            }
            .frame(height: 8)
            Text(v.map { Fmt.pct($0, digits: 0, signed: false) } ?? "—").font(.data(12)).frame(width: 44, alignment: .trailing)
            Text("\(t.n)").font(.data(11)).foregroundStyle(.secondary).frame(width: 34, alignment: .trailing)
        }
    }
}

// MARK: - Cost of errors

struct ErrorsCard: View {
    let model: TableModel

    var body: some View {
        let s = model.state.stats
        let per100 = s.rounds > 0 ? s.evLost / Double(s.rounds) * 100 : 0
        Panel(title: "Cost of errors", systemImage: "exclamationmark.triangle") {
            HStack(alignment: .firstTextBaseline) {
                Text(Fmt.money(s.evLost))
                    .font(.system(size: 34, weight: .bold, design: .monospaced))
                    .foregroundStyle(s.evLost > 0 ? Theme.bad : Theme.good)
                    .contentTransition(.numericText(value: s.evLost))
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("\(Fmt.money(per100)) per 100 rounds").font(.caption.weight(.semibold))
                    Text("\(s.decisions - s.correct) mistakes").font(.caption).foregroundStyle(.secondary)
                }
            }
            Text("Expected value given up by each wrong decision, priced from the cards that were actually left.")
                .font(.caption).foregroundStyle(.secondary)
        }
    }
}

// MARK: - Side bets

struct SideBetsCard: View {
    @Environment(AppModel.self) private var app
    let model: TableModel

    var body: some View {
        let evs = model.state.sideBetEvs
        let names = ["Perfect Pairs", "21+3", "Lucky Ladies"]
        Panel(title: "Side bets · exact edge now", systemImage: "suit.diamond") {
            ForEach(Array(names.enumerated()), id: \.offset) { i, n in
                let ev = evs.indices.contains(i) ? evs[i] : 0
                HStack {
                    Text(n).font(.subheadline.weight(.semibold))
                    Spacer()
                    Text(ev >= 0 ? "\(Fmt.pct(ev)) player" : "\(Fmt.pct(-ev, signed: false)) house")
                        .font(.data(13, weight: .bold))
                        .foregroundStyle(ev > 0 ? Theme.good : Theme.fg2)
                }
                GeometryReader { g in
                    let w = g.size.width
                    let x = CGFloat(((ev + 0.3) / 0.4).clamped(0, 1)) * w
                    ZStack(alignment: .leading) {
                        Capsule().fill(Theme.panel2).frame(height: 6)
                        Rectangle().fill(Theme.fg2.opacity(0.5)).frame(width: 1.5, height: 12).offset(x: w * 0.75)
                        Capsule().fill(ev > 0 ? Theme.good : Theme.bad).frame(width: max(4, abs(x - w * 0.75)), height: 6)
                            .offset(x: min(x, w * 0.75))
                    }
                }
                .frame(height: 12)
            }
            Text("From every card left in the shoe. Positive means the bet favours you this round.")
                .font(.caption).foregroundStyle(.secondary)
        }
    }
}

// MARK: - Session

struct SessionCard: View {
    let model: TableModel

    var body: some View {
        let rounds = model.history
        let start = (rounds.first?.bankroll ?? model.state.bankroll) - (rounds.first?.net ?? 0)
        let expected = cumulative(rounds.map(\.ev))
        Panel(title: "Session", systemImage: "chart.xyaxis.line") {
            if rounds.count < 2 {
                Text("Play a few rounds to see your bankroll against what you should expect.")
                    .font(.caption).foregroundStyle(.secondary)
            } else {
                Chart {
                    ForEach(Array(rounds.enumerated()), id: \.offset) { i, r in
                        LineMark(x: .value("Round", i + 1), y: .value("Bankroll", r.bankroll), series: .value("Series", "Bankroll"))
                            .foregroundStyle(Theme.brass)
                            .interpolationMethod(.monotone)
                    }
                    ForEach(Array(expected.enumerated()), id: \.offset) { i, e in
                        LineMark(x: .value("Round", i + 1), y: .value("Bankroll", start + e), series: .value("Series", "Expected"))
                            .foregroundStyle(Theme.fg2.opacity(0.6))
                            .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                    }
                }
                .chartYAxis { AxisMarks(position: .leading) }
                .chartXAxis { AxisMarks(values: .automatic(desiredCount: 4)) }
                .frame(height: 160)
                HStack(spacing: 14) {
                    Label("Bankroll", systemImage: "circle.fill").foregroundStyle(Theme.brass)
                    Label("Expected", systemImage: "circle.dashed").foregroundStyle(Theme.fg2)
                    Spacer()
                    Text("Luck: \(luck(rounds))").foregroundStyle(.secondary)
                }
                .font(.caption2.weight(.semibold))
            }
        }
    }

    private func cumulative(_ xs: [Double]) -> [Double] {
        var s = 0.0
        return xs.map { s += $0; return s }
    }

    /// How far the result is from expectation, in standard deviations.
    private func luck(_ rounds: [RoundSummary]) -> String {
        let net = rounds.reduce(0) { $0 + $1.net }
        let ev = rounds.reduce(0) { $0 + $1.ev }
        let sd = sqrt(rounds.reduce(0) { $0 + $1.variance })
        guard sd > 0 else { return "—" }
        let z = (net - ev) / sd
        return String(format: "%+.1f SD", z)
    }
}

// MARK: - Statistics

struct StatsCard: View {
    let stats: SessionStats
    let elapsedMs: Double

    var body: some View {
        let items: [(String, String)] = [
            ("Rounds", "\(stats.rounds)"), ("Hands", "\(stats.hands)"), ("Time", Fmt.duration(ms: elapsedMs)),
            ("Won", "\(stats.wins)"), ("Lost", "\(stats.losses)"), ("Pushed", "\(stats.pushes)"),
            ("Blackjacks", "\(stats.blackjacks)"), ("Doubles", "\(stats.doubles)"), ("Splits", "\(stats.splits)"),
            ("Surrenders", "\(stats.surrenders)"), ("Insurance", "\(stats.insurances)"), ("Net", Fmt.signedMoney(stats.net)),
        ]
        Panel(title: "Statistics", systemImage: "tablecells") {
            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 10) {
                ForEach(0..<4, id: \.self) { r in
                    GridRow {
                        ForEach(0..<3, id: \.self) { c in
                            let it = items[r * 3 + c]
                            VStack(alignment: .leading, spacing: 1) {
                                Text(it.0.uppercased()).font(.system(size: 9, weight: .semibold)).tracking(0.8).foregroundStyle(Theme.muted)
                                Text(it.1).font(.data(16, weight: .bold))
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Decision log

struct LogCard: View {
    let log: [DecisionRecord]

    var body: some View {
        Panel(title: "Recent decisions", systemImage: "list.bullet.rectangle") {
            if log.isEmpty {
                Text("Your decisions appear here, graded against the correct play for the count.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            ForEach(Array(log.prefix(12).enumerated()), id: \.offset) { _, d in
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: d.correct ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .foregroundStyle(d.correct ? Theme.good : Theme.bad)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(d.spot).font(.subheadline.weight(.semibold))
                        Text(d.correct ? d.chosen : "\(d.chosen) — best was \(d.best)")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 1) {
                        if let i = d.index { Text(i).font(.caption2.weight(.semibold)).foregroundStyle(Theme.brass) }
                        if d.evCost > 0 { Text("−\(Fmt.pct(d.evCost, digits: 1, signed: false))").font(.caption2.monospacedDigit()).foregroundStyle(Theme.bad) }
                    }
                }
            }
        }
    }
}
