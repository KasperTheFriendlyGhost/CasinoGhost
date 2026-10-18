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
    /// Weighted least-squares line through the rows: ev = intercept + slope * count.
    pub intercept: f64,
    pub slope: f64,
    /// Overall EV per round, flat betting every round.
    pub overall: f64,
    /// The smooth curve the gauge reads: ev = c0 + c1·x + c2·x² + c3·x³ on [fit_lo, fit_hi],
    /// continued as a straight line beyond, where x = count − shift.
    pub coefficients: Vec<f64>,
    pub fit_lo: f64,
    pub fit_hi: f64,
    /// Rows hold counts from c to c + 1 when the count isn't rounded, so the curve is read half
    /// a count lower to stay centred.
    pub shift: f64,
}

impl EdgeModel {
    /// Build from a simulation. Rows with fewer than `min_rounds` are dropped. `exact_counts` is
    /// true when the player's count is not rounded to whole numbers.
    pub fn from_sim(sim: &SimResult, min_rounds: u64, exact_counts: bool) -> EdgeModel {
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
        let pts: Vec<(f64, f64, f64)> = rows
            .iter()
            .filter(|r| r.se.is_finite() && r.se > 0.0)
            .map(|r| (r.count as f64, r.ev, 1.0 / (r.se * r.se)))
            .collect();
        let (intercept, slope) = match weighted_poly(&pts, 1) {
            Some(c) => (c[0], c[1]),
            None => (sim.ev(), 0.005),
        };
        let (fit_lo, fit_hi) = match (pts.first(), pts.last()) {
            (Some(a), Some(b)) => (a.0, b.0),
            _ => (0.0, 0.0),
        };
        // the highest degree (up to cubic) whose curve never falls as the count rises: noise at
        // the thin ends can bend a cubic the wrong way
        let coefficients = (1..=3)
            .rev()
            .filter_map(|d| weighted_poly(&pts, d))
            .find(|c| rising(c, fit_lo, fit_hi))
            .unwrap_or_else(|| vec![intercept, slope]);
        EdgeModel { rows, intercept, slope, overall: sim.ev(), coefficients, fit_lo, fit_hi, shift: if exact_counts { 0.5 } else { 0.0 } }
    }

    /// Expected edge at a (possibly fractional) count, from the fitted curve.
    pub fn edge_at(&self, count: f64) -> f64 {
        if self.coefficients.is_empty() {
            return self.intercept + self.slope * count;
        }
        let x = count - self.shift;
        let c = &self.coefficients;
        if x < self.fit_lo {
            poly(c, self.fit_lo) + poly_slope(c, self.fit_lo).max(0.0) * (x - self.fit_lo)
        } else if x > self.fit_hi {
            poly(c, self.fit_hi) + poly_slope(c, self.fit_hi).max(0.0) * (x - self.fit_hi)
        } else {
            poly(c, x)
        }
    }

    /// Range of the true edge at a count (10th–90th percentile), placed around the curve.
    /// How far each side sits from the sampled shoes' mean is interpolated between counts and
    /// held level beyond them. It is not smoothed: the band really is narrow near a count of
    /// zero, where most shoes are barely dealt.
    pub fn band_at(&self, count: f64) -> Option<(f64, f64)> {
        let rows: Vec<(f64, f64, f64)> = self
            .rows
            .iter()
            .filter_map(|r| {
                let m = r.exact_mean?;
                Some((r.count as f64, r.low? - m, r.high? - m))
            })
            .collect();
        let (first, last) = (rows.first()?, rows.last()?);
        let x = count - self.shift;
        let (dl, dh) = if x <= first.0 {
            (first.1, first.2)
        } else if x >= last.0 {
            (last.1, last.2)
        } else {
            let i = rows.iter().position(|r| r.0 > x)?;
            let (a, b) = (rows[i - 1], rows[i]);
            let t = (x - a.0) / (b.0 - a.0);
            (a.1 + t * (b.1 - a.1), a.2 + t * (b.2 - a.2))
        };
        let e = self.edge_at(count);
        Some((e + dl.min(0.0), e + dh.max(0.0)))
    }

    /// Count at which the edge turns positive, from the fitted curve.
    pub fn break_even(&self) -> f64 {
        let f = |x: f64| self.edge_at(x);
        let (mut lo, mut hi) = (-60.0, 60.0);
        if f(lo) > 0.0 || f(hi) < 0.0 {
            return if f(lo) > 0.0 { f64::NEG_INFINITY } else { f64::INFINITY };
        }
        for _ in 0..80 {
            let mid = 0.5 * (lo + hi);
            if f(mid) < 0.0 { lo = mid } else { hi = mid }
        }
        0.5 * (lo + hi)
    }
}

fn poly(c: &[f64], x: f64) -> f64 {
    c.iter().rev().fold(0.0, |acc, k| acc * x + k)
}

fn poly_slope(c: &[f64], x: f64) -> f64 {
    c.iter().enumerate().skip(1).rev().fold(0.0, |acc, (i, k)| acc * x + i as f64 * k)
}

fn rising(c: &[f64], lo: f64, hi: f64) -> bool {
    (0..=40).all(|i| poly_slope(c, lo + (hi - lo) * i as f64 / 40.0) >= 0.0)
}

/// Weighted least-squares polynomial of `degree` through `(x, y, weight)` points, as raw
/// coefficients c0..c_degree. Solved in centred, scaled x for conditioning.
fn weighted_poly(pts: &[(f64, f64, f64)], degree: usize) -> Option<Vec<f64>> {
    let n = degree + 1;
    if pts.len() < n + 1 {
        return None;
    }
    let sw: f64 = pts.iter().map(|p| p.2).sum();
    let m = pts.iter().map(|p| p.0 * p.2).sum::<f64>() / sw;
    let s = pts.iter().map(|p| (p.0 - m).abs()).fold(0.0, f64::max).max(1.0);
    // normal equations A d = b in t = (x - m) / s
    let mut a = vec![vec![0.0; n + 1]; n];
    for &(x, y, w) in pts {
        let t = (x - m) / s;
        let pw: Vec<f64> = (0..2 * n).map(|k| t.powi(k as i32)).collect();
        for i in 0..n {
            for j in 0..n {
                a[i][j] += w * pw[i + j];
            }
            a[i][n] += w * pw[i] * y;
        }
    }
    // Gaussian elimination with partial pivoting
    for col in 0..n {
        let piv = (col..n).max_by(|&i, &j| a[i][col].abs().total_cmp(&a[j][col].abs()))?;
        if a[piv][col].abs() < 1e-14 {
            return None;
        }
        a.swap(col, piv);
        for row in 0..n {
            if row != col {
                let f = a[row][col] / a[col][col];
                for k in col..=n {
                    a[row][k] -= f * a[col][k];
                }
            }
        }
    }
    let d: Vec<f64> = (0..n).map(|i| a[i][n] / a[i][i]).collect();
    // expand sum d_k ((x - m) / s)^k into powers of x
    let mut c = vec![0.0; n];
    for (k, dk) in d.iter().enumerate() {
        let mut binom = 1.0;
        for j in 0..=k {
            c[j] += dk * binom * (-m).powi((k - j) as i32) / s.powi(k as i32);
            binom = binom * (k - j) as f64 / (j + 1) as f64;
        }
    }
    Some(c)
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
        let mut m = EdgeModel::from_sim(&sim, 20_000, false);
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
        // the smooth curve stays within sampling error of every well-measured count
        for r in m.rows.iter().filter(|r| (-5..=5).contains(&r.count)) {
            let z = (m.edge_at(r.count as f64) - r.ev) / r.se;
            assert!(z.abs() < 3.5, "count {}: curve {} vs sim {} ± {}", r.count, m.edge_at(r.count as f64), r.ev, r.se);
        }
        // the band surrounds the curve and moves smoothly between counts
        for c in [-2.0, 0.0, 1.5, 4.0] {
            let (lo, hi) = m.band_at(c).unwrap();
            assert!(lo < m.edge_at(c) && m.edge_at(c) < hi && hi - lo < 0.04, "count {c}: {lo} {hi}");
            let (lo2, hi2) = m.band_at(c + 0.01).unwrap();
            assert!((lo2 - lo).abs() < 2e-4 && (hi2 - hi).abs() < 2e-4);
        }
    }

    #[test]
    fn weighted_fit_recovers_a_cubic() {
        let truth = [-0.004, 0.005, 0.0002, 0.00003];
        let pts: Vec<(f64, f64, f64)> = (-8..=9).map(|x| (x as f64, poly(&truth, x as f64), 1.0 + (x * x) as f64)).collect();
        let c = weighted_poly(&pts, 3).unwrap();
        for (a, b) in c.iter().zip(truth) {
            assert!((a - b).abs() < 1e-12, "{c:?}");
        }
        let line = weighted_poly(&pts[..5], 1).unwrap();
        assert_eq!(line.len(), 2);
        assert!((poly_slope(&truth, 2.0) - (0.005 + 0.0008 + 0.00036)).abs() < 1e-15);
    }

    #[test]
    fn curve_is_continuous_and_extrapolates_in_a_line() {
        let m = EdgeModel { coefficients: vec![-0.004, 0.005, 0.0002, 0.00003], fit_lo: -6.0, fit_hi: 8.0, ..Default::default() };
        for edge in [-6.0, 8.0] {
            assert!((m.edge_at(edge - 1e-9) - m.edge_at(edge + 1e-9)).abs() < 1e-9);
        }
        let s = m.edge_at(12.0) - m.edge_at(11.0);
        assert!((m.edge_at(13.0) - m.edge_at(12.0) - s).abs() < 1e-12);
        let be = m.break_even();
        assert!(m.edge_at(be).abs() < 1e-12 && be > 0.7 && be < 0.8, "{be}");
        // a half-count shift for unrounded counts
        let shifted = EdgeModel { shift: 0.5, ..m.clone() };
        assert!((shifted.edge_at(2.5) - m.edge_at(2.0)).abs() < 1e-15);
        assert!((shifted.break_even() - be - 0.5).abs() < 1e-9);
    }
}
