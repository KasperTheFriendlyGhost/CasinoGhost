//! The model behind the edge gauge.
//!
//! * `ev` at each count comes from simulation for the exact rules, penetration, count system,
//!   true-count convention and index plays: what a counter can know from the count.
//! * `low`/`high` give the 10th–90th percentile of the *true* edge of the shoes met at that
//!   count (exact analysis on sampled shoes): how much the real edge varies around the estimate.
//! * `exact_edge` is the true edge of the actual remaining cards, for the "reveal" marker.

use crate::ca::{self, round_ev};
use crate::cards::{comp_total, Comp};
use crate::rules::Rules;
use crate::sim::{SimResult, Samples};
use crate::strategy::{idx, IndexPlay, Strategy};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct EdgeRow {
    pub count: i32,
    /// Share of rounds dealt at this count.
    pub freq: f64,
    /// Expected result per unit bet (simulated) and its standard error.
    pub ev: f64,
    pub se: f64,
    /// Standard deviation of one round at this count.
    pub sd: f64,
    /// Spread of the true edge at this count (exact analysis of sampled shoes).
    pub exact_mean: Option<f64>,
    pub low: Option<f64>,
    pub high: Option<f64>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct EdgeModel {
    pub rows: Vec<EdgeRow>,
    /// Weighted least-squares line through the reliable rows: ev = intercept + slope * count.
    pub intercept: f64,
    pub slope: f64,
    /// Overall EV per round, flat betting every round.
    pub overall: f64,
}

impl EdgeModel {
    /// Build from a simulation. Rows with fewer than `min_rounds` are dropped.
    pub fn from_sim(sim: &SimResult, min_rounds: u64) -> EdgeModel {
        let total = sim.totals.rounds.max(1);
        let rows: Vec<EdgeRow> = sim
            .rows
            .iter()
            .filter(|r| r.rounds >= min_rounds)
            .map(|r| EdgeRow {
                count: r.count,
                freq: r.rounds as f64 / total as f64,
                ev: r.ev(),
                se: r.se(),
                sd: r.var().sqrt(),
                ..Default::default()
            })
            .collect();
        // weighted regression (weights 1/se^2) over rows with useful precision
        let (mut sw, mut sx, mut sy, mut sxx, mut sxy) = (0.0, 0.0, 0.0, 0.0, 0.0);
        for r in rows.iter().filter(|r| r.se.is_finite() && r.se > 0.0 && r.count.abs() <= 10) {
            let w = 1.0 / (r.se * r.se);
            let x = r.count as f64;
            sw += w;
            sx += w * x;
            sy += w * r.ev;
            sxx += w * x * x;
            sxy += w * x * r.ev;
        }
        let den = sw * sxx - sx * sx;
        let (slope, intercept) = if den.abs() > 1e-12 {
            let s = (sw * sxy - sx * sy) / den;
            (s, (sy - s * sx) / sw)
        } else {
            (0.005, sim.ev())
        };
        EdgeModel { rows, intercept, slope, overall: sim.ev() }
    }

    /// Expected edge at a (possibly fractional) count: the simulated value where it is precise,
    /// blended toward the fitted line where the simulation is thin.
    pub fn edge_at(&self, count: f64) -> f64 {
        let line = self.intercept + self.slope * count;
        let b = (count + 1e-9).floor() as i32;
        match self.rows.iter().find(|r| r.count == b) {
            Some(r) if r.se.is_finite() => {
                // shrink toward the line by the row's noise
                let noise = r.se * r.se;
                let prior = 0.0004f64.powi(2);
                let w = prior / (prior + noise);
                w * r.ev + (1.0 - w) * line
            }
            _ => line,
        }
    }

    /// Range of the true edge at a count (10th–90th percentile), if sampled.
    pub fn band_at(&self, count: f64) -> Option<(f64, f64)> {
        let b = (count + 1e-9).floor() as i32;
        self.rows.iter().find(|r| r.count == b).and_then(|r| Some((r.low?, r.high?)))
    }

    /// Count at which the edge turns positive (from the fitted line).
    pub fn break_even(&self) -> f64 {
        if self.slope > 0.0 { -self.intercept / self.slope } else { f64::INFINITY }
    }
}

/// The player's choice for a starting hand at `count`: basic strategy plus index plays.
fn choose(strategy: &Strategy, plays: &[IndexPlay], count: f64, kind: ca::Kind, key: usize, up: usize) -> u8 {
    let base = strategy.initial.get(kind).best[idx(key, up)];
    if let Some(d) = plays.iter().find(|d| d.kind == kind && d.key == key && d.up == up && (base == d.above || base == d.below)) {
        return if count >= d.index - 1e-9 { d.above } else { d.below };
    }
    base
}

/// True edge of the next round from the actual undealt cards, for a player using basic strategy
/// plus `plays` at `count` and taking insurance at `insurance_index`.
pub fn exact_edge(rules: &Rules, comp: &Comp, strategy: &Strategy, plays: &[IndexPlay], insurance_index: Option<f64>, count: f64) -> f64 {
    let mut ev = round_ev(rules, comp, |kind, key, up, _| choose(strategy, plays, count, kind, key, up));
    if rules.peek && insurance_index.is_some_and(|i| count >= i - 1e-9) && comp[1] >= 1.0 {
        let p_ace = comp[1] / comp_total(comp);
        let mut rem = *comp;
        rem[1] -= 1.0;
        ev += p_ace * ca::insurance_ev(&rem);
    }
    ev
}

/// Add the spread of the true edge at each count, from sampled shoes (`per_count` per count).
pub fn add_spread(model: &mut EdgeModel, rules: &Rules, strategy: &Strategy, plays: &[IndexPlay], insurance_index: Option<f64>, samples: &Samples, per_count: usize) {
    let mut by: BTreeMap<i32, Vec<Comp>> = BTreeMap::new();
    for (b, c) in &samples.comps {
        let v = by.entry(*b).or_default();
        if v.len() < per_count {
            v.push(*c);
        }
    }
    let jobs: Vec<(i32, Comp)> = by.iter().flat_map(|(b, v)| v.iter().map(move |c| (*b, *c))).collect();
    let vals: Vec<(i32, f64)> = jobs
        .par_iter()
        .map(|(b, c)| (*b, exact_edge(rules, c, strategy, plays, insurance_index, *b as f64)))
        .collect();
    let mut grouped: BTreeMap<i32, Vec<f64>> = BTreeMap::new();
    for (b, v) in vals {
        grouped.entry(b).or_default().push(v);
    }
    for r in model.rows.iter_mut() {
        if let Some(v) = grouped.get_mut(&r.count) {
            if v.len() < 5 {
                continue;
            }
            v.sort_by(|a, b| a.partial_cmp(b).unwrap());
            let q = |p: f64| v[((v.len() - 1) as f64 * p).round() as usize];
            r.exact_mean = Some(v.iter().sum::<f64>() / v.len() as f64);
            r.low = Some(q(0.1));
            r.high = Some(q(0.9));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cards::fresh_comp;
    use crate::count::{system, TrueCountMode};
    use crate::rules::{Surrender, TableConditions};
    use crate::sim::{sample_compositions, simulate, Progress, SimConfig};
    use crate::strategy::{applicable, basic_strategy, house_edge, published_hilo, IndexSet, HILO_INSURANCE_INDEX};

    #[test]
    fn exact_edge_of_a_fresh_shoe_is_minus_the_house_edge() {
        let rules = Rules::default();
        let s = basic_strategy(&rules);
        let e = exact_edge(&rules, &fresh_comp(6), &s, &[], None, 0.0);
        assert!((e + house_edge(&rules, &s)).abs() < 1e-12);
        // a ten-rich shoe favours the player
        let mut c = fresh_comp(6);
        for v in 2..=6 {
            c[v] -= 8.0;
        }
        assert!(exact_edge(&rules, &c, &s, &[], None, 0.0) > 0.01);
    }

    #[test]
    fn gauge_model_tracks_the_true_edge() {
        let rules = Rules { surrender: Surrender::Late, penetration: 0.8, ..Rules::default() };
        let s = basic_strategy(&rules);
        let plays = applicable(&published_hilo(), &rules, &s, IndexSet::I18Fab4);
        let cfg = SimConfig {
            rules,
            table: TableConditions::default(),
            count: system("hilo"),
            tc_mode: TrueCountMode::default(),
            plays: plays.clone(),
            insurance_index: Some(HILO_INSURANCE_INDEX),
            rounds: 6_000_000,
            seed: 3,
        };
        let sim = simulate(&cfg, &Progress::default());
        let mut m = EdgeModel::from_sim(&sim, 20_000);
        assert!(m.slope > 0.004 && m.slope < 0.007, "slope {}", m.slope);
        // counts are floored, so "0" means a true count from 0 to 1: the edge turns positive
        // around there
        let be = m.break_even();
        assert!(be > -0.5 && be < 1.5, "break-even {be}");
        let samples = sample_compositions(&SimConfig { rounds: 300_000, ..cfg.clone() }, 40, &Progress::default());
        add_spread(&mut m, &rules, &s, &plays, Some(HILO_INSURANCE_INDEX), &samples, 40);
        // where both exist, the exact-analysis mean agrees with the simulated EV
        for r in m.rows.iter().filter(|r| r.exact_mean.is_some() && (-3..=4).contains(&r.count)) {
            let (lo, hi) = (r.low.unwrap(), r.high.unwrap());
            assert!(lo < hi);
            let mean = r.exact_mean.unwrap();
            assert!((mean - r.ev).abs() < 0.006, "count {}: exact {mean} vs sim {}", r.count, r.ev);
        }
        // higher counts sit higher on the gauge
        assert!(m.edge_at(3.0) > m.edge_at(0.0) && m.edge_at(0.0) > m.edge_at(-3.0));
    }
}
