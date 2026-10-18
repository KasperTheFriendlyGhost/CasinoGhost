import SwiftUI
import CasinoGhostCore

enum ChartKind: String, CaseIterable, Identifiable {
    case hard, soft, pairs
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
}

struct StrategyScreen: View {
    @Environment(AppModel.self) private var app
    @State private var kind: ChartKind = .hard

    var body: some View {
        let s = app.settings
        let chart = strategyChart(rules: s.rules)
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    Panel(title: "Basic strategy for", systemImage: "square.grid.3x3") {
                        Text(s.rules.shorthand).font(.title3.monospaced().weight(.bold))
                        HStack {
                            VStack(alignment: .leading, spacing: 1) {
                                Text("HOUSE EDGE, PERFECT PLAY").font(.system(size: 9, weight: .semibold)).tracking(1).foregroundStyle(Theme.muted)
                                Text(Fmt.pct(chart.houseEdge, digits: 3, signed: false)).font(.display(30, weight: .heavy))
                            }
                            Spacer()
                        }
                        Text("Every cell is solved by the exact expected-value engine for these rules, so the chart changes as soon as a rule does.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Picker("Chart", selection: $kind) {
                        ForEach(ChartKind.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    StrategyGrid(rows: rows(chart))
                    Legend()
                    IndexList()
                }
                .padding(16)
                .frame(maxWidth: 820)
                .frame(maxWidth: .infinity)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Strategy")
        }
    }

    private func rows(_ c: StrategyChart) -> [ChartRow] {
        switch kind {
        case .hard: return c.hard
        case .soft: return c.soft
        case .pairs: return c.pairs
        }
    }
}

struct StrategyGrid: View {
    let rows: [ChartRow]
    private let ups = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"]

    var body: some View {
        Grid(horizontalSpacing: 3, verticalSpacing: 3) {
            GridRow {
                Text("").frame(width: 40)
                ForEach(ups, id: \.self) { u in
                    Text(u).font(.caption.weight(.bold)).foregroundStyle(.secondary).frame(maxWidth: .infinity)
                }
            }
            ForEach(rows, id: \.key) { r in
                GridRow {
                    Text(r.label).font(.data(12, weight: .bold)).frame(width: 40, alignment: .leading)
                    ForEach(Array(r.codes.enumerated()), id: \.offset) { _, code in
                        Text(code)
                            .font(.system(size: 12, weight: .heavy, design: .rounded))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity, minHeight: 28)
                            .background(Self.color(code), in: RoundedRectangle(cornerRadius: 5, style: .continuous))
                            .accessibilityLabel(Self.name(code))
                    }
                }
            }
        }
        .padding(10)
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: Theme.corner, style: .continuous))
    }

    static func color(_ code: String) -> Color {
        switch code.prefix(1) {
        case "H": return Color(hex: 0x2F6FB0)
        case "S": return Color(hex: 0xC9962E)
        case "D": return Color(hex: 0x23864C)
        case "P": return Color(hex: 0x6B3FA0)
        case "R": return Color(hex: 0xC23B36)
        default: return .gray
        }
    }

    static func name(_ code: String) -> String {
        switch code {
        case "H": return "Hit"
        case "S": return "Stand"
        case "D": return "Double, else hit"
        case "Ds": return "Double, else stand"
        case "P": return "Split"
        case "R": return "Surrender, else hit"
        case "Rs": return "Surrender, else stand"
        case "Rp": return "Surrender, else split"
        default: return code
        }
    }
}

private struct Legend: View {
    var body: some View {
        let items = [("H", "Hit"), ("S", "Stand"), ("D", "Double (else hit)"), ("Ds", "Double (else stand)"), ("P", "Split"), ("R", "Surrender")]
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 8)], alignment: .leading, spacing: 6) {
            ForEach(items, id: \.0) { code, name in
                HStack(spacing: 6) {
                    Text(code).font(.system(size: 11, weight: .heavy)).foregroundStyle(.white)
                        .frame(width: 26, height: 20)
                        .background(StrategyGrid.color(code), in: RoundedRectangle(cornerRadius: 4))
                    Text(name).font(.caption)
                }
            }
        }
    }
}

/// The index plays the table is using.
private struct IndexList: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        let s = app.settings
        let p = app.activePlays
        Panel(title: "Index plays at the table · \(s.indexMode.label)", systemImage: "number.circle") {
            if p.plays.isEmpty && p.insurance == nil {
                Text(s.countId != "hilo" && s.indexMode != .none
                     ? "Published indices are for Hi-Lo. Generate indices for \(s.count.name) in the Lab."
                     : "Index plays are off. Turn them on in Rules.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let ins = p.insurance {
                row("Insurance", "Take at \(s.countLabel) \(Fmt.count(ins))")
            }
            ForEach(Array(p.plays.prefix(60).enumerated()), id: \.offset) { _, d in
                let move = d.baseBelow ? d.above : d.below
                row(d.label, "\(move.label) \(d.baseBelow ? "at" : "below") \(s.countLabel) \(Fmt.count(d.index))")
            }
        }
    }

    private func row(_ a: String, _ b: String) -> some View {
        HStack {
            Text(a).font(.subheadline.weight(.semibold))
            Spacer()
            Text(b).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
        }
    }
}
