//! Index generation for any rules, count system and true-count convention.
//!
//! Method: simulate shoes and collect the real compositions a player meets at each count
//! (not an idealised "average" shoe). For every strategy cell and every sampled composition,
//! compute each action's exact value with the combinatorial engine, then average by count.
//! An index is where the best action changes. Averaging exact values instead of playing hands
//! out removes almost all sampling noise.

use crate::ca::{self, best_action, Kind, SURRENDER};
use crate::cards::{comp_total, fresh_comp, Comp};
use crate::count::Rounding;
use crate::rules::Surrender;
use crate::sim::{sample_compositions, Progress, SimConfig};
use crate::strategy::{basic_strategy, idx, IndexPlay};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::atomic::Ordering;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct GeneratedIndex {
    pub play: IndexPlay,
    /// Continuous crossing point (interpolated between counts).
    pub crossing: f64,
    /// Gain over basic strategy, units per 100 rounds, from making this play at the right counts.
    pub gain_per_100: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct IndexReport {
    pub indices: Vec<GeneratedIndex>,
    /// Insurance index (None if never positive in range).
    pub insurance: Option<f64>,
    pub insurance_crossing: Option<f64>,
    pub samples: usize,
}

/// Candidate cells: hard 5–17, soft 13–20 and all pairs, against every upcard.
fn cells() -> Vec<(Kind, usize, usize)> {
    let mut v = vec![];
    for up in 1..=10 {
        for t in 5..=17 {
            v.push((Kind::Hard, t, up));
        }
        for t in 13..=20 {
            v.push((Kind::Soft, t, up));
        }
        for r in 1..=10 {
            v.push((Kind::Pair, r, up));
        }
    }
    v
}

/// Index value from a crossing, for the player's rounding convention.
fn index_from(bucket_first_positive: i32, crossing: f64, rounding: Rounding) -> f64 {
    match rounding {
        Rounding::Exact => (crossing * 10.0).round() / 10.0,
        _ => bucket_first_positive as f64,
    }
}

/// Accumulated values for one strategy cell at one decision-time count.
#[derive(Clone, Copy, Default)]
struct Acc {
    /// Probability mass (sample weight x chance of the hand) per action, and value sums.
    mass: [f64; 5],
    sum: [f64; 5],
    /// Distinct sampled shoes contributing.
    n: usize,
}

impl Acc {
    fn mean(&self) -> [f64; 5] {
        let mut m = [f64::NAN; 5];
        for a in 0..5 {
            if self.mass[a] > 0.0 {
                m[a] = self.sum[a] / self.mass[a];
            }
        }
        m
    }
}

/// The count the player sees at a decision, from the cards still undealt.
struct CountFrame<'a> {
    cfg: &'a SimConfig,
    tags: [f64; 11],
    seen_full: f64,
    irc: f64,
    lo: i32,
    hi: i32,
}

impl CountFrame<'_> {
    #[inline]
    fn bucket(&self, rem: &Comp) -> i32 {
        // count of the cards already seen = full-shoe sum minus what is still undealt
        let undealt: f64 = (1..=10).map(|v| self.tags[v] * rem[v]).sum();
        let rc = self.irc + self.seen_full - undealt;
        let left = comp_total(rem).max(1.0) as usize;
        let c = self.cfg.tc_mode.count(&self.cfg.count, (rc * 2.0).round() as i32, left);
        crate::count::bucket(c, self.lo, self.hi)
    }
}

/// Generate indices. `cfg.rounds` controls how many rounds are simulated to collect
/// compositions; `per_bucket` how many are kept at each starting count. Values are binned by
/// the count at the moment of the decision (after the player's cards and the upcard are seen),
/// which is the count a player compares with an index.
pub fn generate(cfg: &SimConfig, per_bucket: usize, min_samples: usize, progress: &Progress) -> IndexReport {
    let rules = cfg.rules.sanitized();
    let samples = sample_compositions(cfg, per_bucket, progress);
    let (lo, hi) = crate::sim::count_range(&cfg.count, rules.decks);
    let tags = cfg.count.mean_tags();
    let frame = CountFrame {
        cfg,
        tags,
        seen_full: (1..=10).map(|v| tags[v] * fresh_comp(rules.decks)[v]).sum(),
        irc: cfg.count.irc2(rules.decks) as f64 / 2.0,
        lo,
        hi,
    };
    // weight of each sample: frequency of its starting count / samples kept at that count
    let mut kept: BTreeMap<i32, usize> = BTreeMap::new();
    for (b, _) in &samples.comps {
        *kept.entry(*b).or_default() += 1;
    }
    let weighted: Vec<(f64, Comp)> =
        samples.comps.iter().map(|(b, c)| (samples.freq(*b) / kept[b] as f64, *c)).collect();
    let strategy = basic_strategy(&rules);
    let all_cells = cells();

    progress.done.store(0, Ordering::Relaxed);
    let accs: Vec<BTreeMap<i32, Acc>> = all_cells
        .par_iter()
        .map(|&(kind, key, up)| {
            let mut m: BTreeMap<i32, Acc> = BTreeMap::new();
            if progress.cancel.load(Ordering::Relaxed) {
                return m;
            }
            let combos = ca::cell_combos(kind, key);
            for (sw, c) in &weighted {
                if c[up] < 1.0 {
                    continue;
                }
                let n = comp_total(c);
                let p_up = c[up] / n;
                let mut rem1 = *c;
                rem1[up] -= 1.0;
                let n1 = n - 1.0;
                let mut touched: Option<i32> = None;
                for &(a, b, mult) in &combos {
                    let na = rem1[a];
                    let nb = rem1[b] - if a == b { 1.0 } else { 0.0 };
                    if na < 1.0 || nb < 1.0 {
                        continue;
                    }
                    let p = sw * p_up * mult * (na / n1) * (nb / (n1 - 1.0));
                    let mut rem2 = rem1;
                    rem2[a] -= 1.0;
                    rem2[b] -= 1.0;
                    let vals = ca::action_values(up, a, b, &rem2, &rules, false);
                    let bk = frame.bucket(&rem2);
                    let e = m.entry(bk).or_default();
                    for i in 0..5 {
                        if !vals[i].is_nan() {
                            e.mass[i] += p;
                            e.sum[i] += p * vals[i];
                        }
                    }
                    if touched != Some(bk) {
                        e.n += 1;
                        touched = Some(bk);
                    }
                }
            }
            progress.done.fetch_add(1, Ordering::Relaxed);
            m
        })
        .collect();

    let mut out = vec![];
    for (ci, &(kind, key, up)) in all_cells.iter().enumerate() {
        let acc = &accs[ci];
        let m: BTreeMap<i32, [f64; 5]> = acc.iter().filter(|(_, a)| a.n >= min_samples).map(|(b, a)| (*b, a.mean())).collect();
        let base = strategy.initial.get(kind).best[idx(key, up)];
        if m.is_empty() {
            continue;
        }
        for dir in [1i32, -1] {
            // walk away from the neutral count until the best action changes: upward from
            // bucket 0 (counts 0 to 1), downward from bucket -1
            let start = if dir > 0 { 0 } else { -1 };
            let mut prev: Option<(i32, [f64; 5])> = m.get(&(start - dir)).map(|v| (start - dir, *v));
            let mut found = None;
            let mut b = start;
            while let Some(v) = m.get(&b) {
                if let Some(best) = best_action(v, &[]) {
                    if best != base && !v[base as usize].is_nan() {
                        found = Some((b, best, *v));
                        break;
                    }
                }
                prev = Some((b, *v));
                b += dir;
            }
            let Some((bf, new_act, vf)) = found else { continue };
            if new_act == SURRENDER && rules.surrender == Surrender::None {
                continue;
            }
            let diff_f = vf[new_act as usize] - vf[base as usize];
            let crossing = match prev {
                Some((bp, vp)) if !vp[new_act as usize].is_nan() => {
                    let diff_p = vp[new_act as usize] - vp[base as usize];
                    let (x0, x1) = (bp as f64 + 0.5, bf as f64 + 0.5);
                    if diff_f != diff_p { x0 + (x1 - x0) * (-diff_p) / (diff_f - diff_p) } else { x1 }
                }
                _ => bf as f64 + 0.5,
            };
            // gain: making the play at every count beyond the index, per round
            let mut gain = 0.0;
            let mut bb = bf;
            while let Some(a) = acc.get(&bb) {
                let d = a.sum[new_act as usize] - a.sum[base as usize];
                if d > 0.0 && a.mass[new_act as usize] > 0.0 && a.mass[base as usize] > 0.0 {
                    gain += d;
                }
                bb += dir;
            }
            let (above, below, base_below, idx_bucket) =
                if dir > 0 { (new_act, base, true, bf) } else { (base, new_act, false, bf + 1) };
            let index = index_from(idx_bucket, crossing, cfg.tc_mode.rounding);
            out.push(GeneratedIndex {
                play: IndexPlay { kind, key, up, index, above, below, base_below, set: "generated".into(), h17: None, no_surrender_only: false },
                crossing,
                gain_per_100: gain * 100.0,
            });
        }
    }
    out.sort_by(|a, b| b.gain_per_100.partial_cmp(&a.gain_per_100).unwrap());

    // Insurance (peek games): take it where P(ten) > 1/3, binned by the count after the ace
    // and the player's two cards are seen.
    let mut ins_acc: BTreeMap<i32, (f64, f64, usize)> = BTreeMap::new();
    if rules.peek {
        for (sw, c) in &weighted {
            if c[1] < 1.0 {
                continue;
            }
            let mut rem1 = *c;
            rem1[1] -= 1.0;
            let n1 = comp_total(&rem1);
            let mut touched = None;
            for a in 1..=10usize {
                for b in a..=10usize {
                    let na = rem1[a];
                    let nb = rem1[b] - if a == b { 1.0 } else { 0.0 };
                    if na < 1.0 || nb < 1.0 {
                        continue;
                    }
                    let p = sw * if a == b { 1.0 } else { 2.0 } * (na / n1) * (nb / (n1 - 1.0));
                    let mut rem2 = rem1;
                    rem2[a] -= 1.0;
                    rem2[b] -= 1.0;
                    let bk = frame.bucket(&rem2);
                    let e = ins_acc.entry(bk).or_default();
                    e.0 += p;
                    e.1 += p * ca::insurance_ev(&rem2);
                    if touched != Some(bk) {
                        e.2 += 1;
                        touched = Some(bk);
                    }
                }
            }
        }
    }
    let mut ins = None;
    let mut ins_cross = None;
    let mut prev: Option<(i32, f64)> = None;
    for (&b, &(mass, sum, n)) in &ins_acc {
        if n < min_samples || mass <= 0.0 {
            continue;
        }
        let e = sum / mass;
        if e > 0.0 && ins.is_none() {
            let cross = match prev {
                Some((bp, ep)) => bp as f64 + 0.5 + (-ep) / (e - ep) * (b - bp) as f64,
                None => b as f64 + 0.5,
            };
            ins = Some(index_from(b, cross, cfg.tc_mode.rounding));
            ins_cross = Some(cross);
        }
        prev = Some((b, e));
    }

    IndexReport { indices: out, insurance: ins, insurance_crossing: ins_cross, samples: samples.comps.len() }
}

/// The plays to use in play and simulation: generated indices above a minimum value.
pub fn plays_from(report: &IndexReport, min_gain_per_100: f64) -> Vec<IndexPlay> {
    report.indices.iter().filter(|g| g.gain_per_100 >= min_gain_per_100).map(|g| g.play.clone()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::count::{system, TrueCountMode};
    use crate::rules::{Rules, TableConditions};

    fn cfg(rules: Rules) -> SimConfig {
        SimConfig {
            rules,
            table: TableConditions { other_players: 2, ..Default::default() },
            count: system("hilo"),
            tc_mode: TrueCountMode { rounding: crate::count::Rounding::Floor, deck_resolution: 0.0 },
            plays: vec![],
            insurance_index: None,
            rounds: 2_500_000,
            seed: 5,
        }
    }

    fn check(rep: &IndexReport, checks: &[(&str, u8, bool, f64)]) -> Vec<String> {
        let mut misses = vec![];
        for (label, above, base_below, want) in checks {
            let got = rep
                .indices
                .iter()
                .find(|g| g.play.label() == *label && g.play.above == *above && g.play.base_below == *base_below)
                .map(|g| g.play.index);
            if !got.is_some_and(|g| (g - want).abs() <= 1.0) {
                misses.push(format!("{label}: got {got:?}, published {want}"));
            }
        }
        misses
    }

    #[test]
    fn hilo_generated_indices_reproduce_the_illustrious_18() {
        use crate::ca::{DOUBLE, SPLIT, STAND};
        let rep = generate(&cfg(Rules { penetration: 0.85, ..Rules::default() }), 100, 30, &Progress::default());
        let misses = check(&rep, &[
            ("Hard 16 vs 10", STAND, true, 0.0),
            ("Hard 15 vs 10", STAND, true, 4.0),
            ("10,10 vs 5", SPLIT, true, 5.0),
            ("10,10 vs 6", SPLIT, true, 4.0),
            ("Hard 10 vs 10", DOUBLE, true, 4.0),
            ("Hard 12 vs 3", STAND, true, 2.0),
            ("Hard 12 vs 2", STAND, true, 3.0),
            ("Hard 11 vs A", DOUBLE, true, 1.0),
            ("Hard 9 vs 2", DOUBLE, true, 1.0),
            ("Hard 10 vs A", DOUBLE, true, 4.0),
            ("Hard 9 vs 7", DOUBLE, true, 3.0),
            ("Hard 16 vs 9", STAND, true, 5.0),
            ("Hard 13 vs 2", STAND, false, -1.0),
            ("Hard 12 vs 4", STAND, false, 0.0),
            ("Hard 12 vs 5", STAND, false, -2.0),
            ("Hard 12 vs 6", STAND, false, -1.0),
            ("Hard 13 vs 3", STAND, false, -2.0),
        ]);
        assert!(misses.is_empty(), "{misses:#?}");
        let ins = rep.insurance.expect("insurance index");
        assert!((ins - 3.0).abs() <= 1.0, "insurance {ins}");
        let top: Vec<String> = rep.indices.iter().take(8).map(|g| g.play.label()).collect();
        assert!(top.iter().any(|l| l == "Hard 16 vs 10" || l == "Hard 15 vs 10" || l == "Hard 12 vs 3"), "{top:?}");
    }

    #[test]
    fn hilo_generated_surrender_indices_reproduce_the_fab_4() {
        let rep = generate(&cfg(Rules { surrender: Surrender::Late, penetration: 0.85, ..Rules::default() }), 100, 30, &Progress::default());
        let misses = check(&rep, &[
            ("Hard 14 vs 10", SURRENDER, true, 3.0),
            ("Hard 15 vs 10", SURRENDER, false, 0.0),
            ("Hard 15 vs 9", SURRENDER, true, 2.0),
            ("Hard 15 vs A", SURRENDER, true, 1.0),
        ]);
        assert!(misses.is_empty(), "{misses:#?}");
    }
}
