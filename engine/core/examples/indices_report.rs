use cg::count::{system, Rounding, TrueCountMode};
use cg::indices::generate;
use cg::rules::{Rules, Surrender, TableConditions};
use cg::sim::{Progress, SimConfig};
use cg::strategy::published_hilo;

fn main() {
    for (name, rules) in [("6D S17 DAS, no surrender", Rules { penetration: 0.85, ..Rules::default() }), ("6D S17 DAS LS", Rules { surrender: Surrender::Late, penetration: 0.85, ..Rules::default() })] {
        let cfg = SimConfig { rules, table: TableConditions { other_players: 2, ..Default::default() }, count: system("hilo"),
            tc_mode: TrueCountMode { rounding: Rounding::Floor, deck_resolution: 0.0 }, plays: vec![], insurance_index: None, rounds: 4_000_000, seed: 21 };
        let t = std::time::Instant::now();
        let rep = generate(&cfg, 160, 30, &Progress::default());
        println!("\n{name}: {} samples, {:.1}s", rep.samples, t.elapsed().as_secs_f64());
        println!("  Insurance: generated {:?} (crossing {:.2}), published +3", rep.insurance, rep.insurance_crossing.unwrap_or(f64::NAN));
        let (mut exact, mut within1, mut n) = (0, 0, 0);
        for p in published_hilo().iter().filter(|p| p.set == "i18" || p.set == "fab4") {
            if (p.set == "fab4") != (rules.surrender == Surrender::Late) { continue; }
            if let Some(g) = rep.indices.iter().find(|g| g.play.kind == p.kind && g.play.key == p.key && g.play.up == p.up && g.play.above == p.above && g.play.base_below == p.base_below) {
                n += 1;
                if g.play.index == p.index { exact += 1 }
                if (g.play.index - p.index).abs() <= 1.0 { within1 += 1 }
                println!("  {:<16} {:>9} published {:>3}  generated {:>3}  (crossing {:>5.2}, gain {:.3}/100)", p.label(), cg::ca::ACTION_NAMES[p.above as usize], p.index, g.play.index, g.crossing, g.gain_per_100);
            }
        }
        println!("  {n} compared: {exact} exact, {within1} within 1");
        println!("  Top 10 by value:");
        for g in rep.indices.iter().take(10) {
            println!("    {:<16} {:>9} at {:>4} ({:.3} units/100)", g.play.label(), cg::ca::ACTION_NAMES[if g.play.base_below { g.play.above } else { g.play.below } as usize], g.play.index, g.gain_per_100);
        }
    }
}
