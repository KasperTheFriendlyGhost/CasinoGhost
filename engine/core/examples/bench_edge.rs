use cg::count::{system, TrueCountMode};
use cg::edge::{add_spread, EdgeModel};
use cg::rules::{Rules, TableConditions};
use cg::sim::{sample_compositions, simulate, Progress, SimConfig};
use cg::strategy::{applicable, basic_strategy, published_hilo, IndexSet, HILO_INSURANCE_INDEX};
use std::time::Instant;

fn main() {
    let rules = Rules::default();
    let s = basic_strategy(&rules);
    let plays = applicable(&published_hilo(), &rules, &s, IndexSet::I18Fab4);
    let cfg = SimConfig { rules, table: TableConditions { other_players: 0, ..Default::default() }, count: system("hilo"), tc_mode: TrueCountMode::default(), plays: plays.clone(), insurance_index: Some(HILO_INSURANCE_INDEX), rounds: 10_000_000, seed: 1 };
    let t = Instant::now();
    let r = simulate(&cfg, &Progress::default());
    let t1 = t.elapsed().as_secs_f64();
    let mut m = EdgeModel::from_sim(&r, 5000, false);
    let t = Instant::now();
    let samples = sample_compositions(&SimConfig { rounds: 300_000, ..cfg.clone() }, 48, &Progress::default());
    add_spread(&mut m, &rules, &s, &plays, Some(HILO_INSURANCE_INDEX), &samples, 48);
    let t2 = t.elapsed().as_secs_f64();
    println!("sim 10M: {t1:.2}s, spread: {t2:.2}s ({} samples), rows {}", samples.comps.len(), m.rows.len());
    println!("curve {:?} on [{}, {}], break-even {:+.2}", m.coefficients, m.fit_lo, m.fit_hi, m.break_even());
    for r in m.rows.iter().filter(|r| (-6..=8).contains(&r.count)) {
        let c = r.count as f64;
        let band = m.band_at(c).unwrap();
        println!(
            "  TC {:+}: sim {:+.3}% ± {:.3}  curve {:+.3}%  band {:+.2}..{:+.2}% (raw {:?})",
            r.count, r.ev * 100.0, r.se * 100.0, m.edge_at(c) * 100.0, band.0 * 100.0, band.1 * 100.0,
            r.low.zip(r.high).map(|(a, b)| ((a * 1e4).round() / 100.0, (b * 1e4).round() / 100.0))
        );
    }
}
