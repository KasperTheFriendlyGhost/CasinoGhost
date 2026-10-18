//! Combinatorial analysis: expected values computed from a shoe composition, not simulated.
//!
//! Model (the same as the original cutcard engine, which was checked against published
//! house edges and strategy tables):
//! * The dealer's outcome distribution is exact, with card removal (memoised on the multiset
//!   of cards the dealer draws).
//! * The player's later hit cards come from the composition at the decision (no further
//!   depletion): exact for an infinite deck, a tiny error for two or more decks.
//! * Resplits recurse to the table's hand limit.
//! * Values are in units of the original bet, unconditional on a dealer natural (peek and
//!   no-hole-card games are both handled).

use crate::cards::{comp_total, fresh_comp, Comp};
use crate::rules::{Rules, Surrender};
use std::cell::RefCell;
use std::collections::HashMap;
use std::hash::{BuildHasherDefault, Hasher};

pub const STAND: u8 = 0;
pub const HIT: u8 = 1;
pub const DOUBLE: u8 = 2;
pub const SPLIT: u8 = 3;
pub const SURRENDER: u8 = 4;
pub const ACTION_NAMES: [&str; 5] = ["Stand", "Hit", "Double", "Split", "Surrender"];

/// Dealer outcomes: 17, 18, 19, 20, 21, bust.
pub type Dist = [f64; 6];
const BUST: Dist = [0., 0., 0., 0., 0., 1.];

#[derive(Default)]
struct Fx(u64);
impl Hasher for Fx {
    fn write(&mut self, bytes: &[u8]) {
        for &b in bytes {
            self.write_u64(b as u64);
        }
    }
    #[inline]
    fn write_u64(&mut self, x: u64) {
        self.0 = (self.0.rotate_left(5) ^ x).wrapping_mul(0x51_7c_c1_b7_27_22_0a_95);
    }
    #[inline]
    fn finish(&self) -> u64 {
        self.0
    }
}
type FxMap<V> = HashMap<u64, V, BuildHasherDefault<Fx>>;

/// 17^(v-1): encodes the multiset of dealer draws as a single integer key.
const POW17: [u64; 11] = {
    let mut p = [0u64; 11];
    let mut v = 1;
    let mut x = 1u64;
    while v <= 10 {
        p[v] = x;
        x *= 17;
        v += 1;
    }
    p
};

thread_local! {
    static MEMO: RefCell<FxMap<Dist>> = RefCell::new(FxMap::default());
}

struct DealerCtx<'a> {
    cnt: Comp,
    h17: bool,
    memo: &'a mut FxMap<Dist>,
}

#[inline]
fn stand_vec(eff: u32) -> Dist {
    let mut d = [0.0; 6];
    d[(eff - 17) as usize] = 1.0;
    d
}

fn rec(ctx: &mut DealerCtx, total: u32, has_ace: bool, n: f64, key: u64) -> Dist {
    let eff = if has_ace && total + 10 <= 21 { total + 10 } else { total };
    if eff > 21 {
        return BUST;
    }
    let soft = eff != total;
    if eff >= 18 || (eff == 17 && !(soft && ctx.h17)) {
        return stand_vec(eff);
    }
    if let Some(v) = ctx.memo.get(&key) {
        return *v;
    }
    let mut out = [0.0; 6];
    for v in 1..=10usize {
        let c = ctx.cnt[v];
        if c <= 0.0 {
            continue;
        }
        let p = c / n;
        ctx.cnt[v] = c - 1.0;
        let sub = rec(ctx, total + v as u32, has_ace || v == 1, n - 1.0, key + POW17[v]);
        ctx.cnt[v] = c;
        for i in 0..6 {
            out[i] += p * sub[i];
        }
    }
    ctx.memo.insert(key, out);
    out
}

#[derive(Clone, Copy, Debug)]
pub struct DealerResult {
    /// Outcome distribution conditional on the dealer not having a natural.
    pub dist: Dist,
    /// Probability of a dealer natural (only non-zero for an ace or ten up).
    pub p_bj: f64,
}

/// Dealer outcome distribution. `comp` = cards remaining after removing the upcard and any
/// known player cards.
pub fn dealer_dist(up: usize, comp: &Comp, h17: bool) -> DealerResult {
    MEMO.with(|m| {
        let mut memo = m.borrow_mut();
        memo.clear();
        let mut ctx = DealerCtx { cnt: *comp, h17, memo: &mut memo };
        let n = comp_total(comp);
        let mut dist = [0.0; 6];
        let mut p_bj = 0.0;
        for h in 1..=10usize {
            let c = ctx.cnt[h];
            if c <= 0.0 {
                continue;
            }
            let p = c / n;
            if (up == 1 && h == 10) || (up == 10 && h == 1) {
                p_bj += p;
                continue;
            }
            ctx.cnt[h] = c - 1.0;
            let sub = rec(&mut ctx, (up + h) as u32, up == 1 || h == 1, n - 1.0, POW17[h]);
            ctx.cnt[h] = c;
            for i in 0..6 {
                dist[i] += p * sub[i];
            }
        }
        let keep = 1.0 - p_bj;
        if keep > 1e-12 {
            for d in dist.iter_mut() {
                *d /= keep;
            }
        }
        DealerResult { dist, p_bj }
    })
}

/// EV of standing on `eff` against a dealer distribution.
#[inline]
pub fn stand_ev(eff: u32, dd: &Dist) -> f64 {
    if eff > 21 {
        return -1.0;
    }
    let mut ev = dd[5];
    for (i, &p) in dd.iter().take(5).enumerate() {
        let d = 17 + i as u32;
        if eff > d {
            ev += p;
        } else if eff < d {
            ev -= p;
        }
    }
    ev
}

/// Hit/stand values with fixed draw probabilities. `t` = hard total (aces as 1),
/// `a` = 1 if the hand holds an ace.
#[derive(Clone, Debug)]
pub struct Dp {
    /// Stand EV by effective total.
    pub s: [f64; 22],
    /// Best of hit and stand, `[a][t]`.
    pub v: [[f64; 22]; 2],
    /// Hit EV, `[a][t]`.
    pub h: [[f64; 22]; 2],
    /// Draw probabilities by value.
    pub p: [f64; 11],
}

pub fn solve_dp(comp: &Comp, dd: &Dist) -> Dp {
    let n = comp_total(comp);
    let mut s = [0.0; 22];
    for e in 2..=21u32 {
        s[e as usize] = stand_ev(e, dd);
    }
    let mut p = [0.0; 11];
    for v in 1..=10 {
        p[v] = comp[v] / n;
    }
    let mut v = [[0.0; 22]; 2];
    let mut h = [[0.0; 22]; 2];
    for t in (2..=21usize).rev() {
        for a in 0..2usize {
            let eff = if a == 1 && t + 10 <= 21 { t + 10 } else { t };
            let mut hv = 0.0;
            for c in 1..=10usize {
                let nt = t + c;
                hv += if nt > 21 { -p[c] } else { p[c] * v[if a == 1 || c == 1 { 1 } else { 0 }][nt] };
            }
            h[a][t] = hv;
            v[a][t] = s[eff].max(hv);
        }
    }
    Dp { s, v, h, p }
}

#[inline]
pub fn eff_total(t: u32, has_ace: bool) -> u32 {
    if has_ace && t + 10 <= 21 { t + 10 } else { t }
}

/// Value of doubling a hand with hard total `t` (`ha` = holds an ace), conditional on no
/// dealer natural, per original bet.
fn double_value(t: usize, ha: bool, dp: &Dp) -> f64 {
    let mut d = 0.0;
    for v in 1..=10usize {
        let nt = t + v;
        let ne = eff_total(nt as u32, ha || v == 1);
        d += dp.p[v] * if nt > 21 { -1.0 } else { dp.s[ne as usize] };
    }
    2.0 * d
}

/// Every action's value for the two-card hand `(c1, c2)` against `up`. `comp` must already
/// exclude the upcard and both player cards. `split_hand` = the hand was created by a split
/// (no surrender; doubling needs DAS). Illegal actions are NaN.
pub fn action_values(up: usize, c1: usize, c2: usize, comp: &Comp, rules: &Rules, split_hand: bool) -> [f64; 5] {
    let mut vals = [f64::NAN; 5];
    let DealerResult { dist: dd, p_bj } = dealer_dist(up, comp, rules.h17);
    let dp = solve_dp(comp, &dd);
    let pb = if up == 1 || up == 10 { p_bj } else { 0.0 };
    let peek = rules.peek;
    // unconditional value from a value conditional on no dealer natural
    let unc = |evc: f64, risk: f64| (1.0 - pb) * evc - pb * if peek { 1.0 } else { risk };
    let obo_risk = |r: f64| if rules.obo { 1.0 } else { r };

    let t = c1 + c2;
    let ha = c1 == 1 || c2 == 1;
    let eff = eff_total(t as u32, ha) as usize;
    let soft = eff != t;

    vals[STAND as usize] = unc(dp.s[eff], 1.0);
    vals[HIT as usize] = unc(dp.h[ha as usize][t], 1.0);

    if (!split_hand || rules.das) && rules.can_double(t as u32, soft) {
        vals[DOUBLE as usize] = unc(double_value(t, ha, &dp), obo_risk(2.0));
    }

    if !split_hand && rules.surrender != Surrender::None {
        vals[SURRENDER as usize] = match rules.surrender {
            Surrender::Late if peek => (1.0 - pb) * -0.5 - pb,
            _ => -0.5,
        };
    }

    let split_allowed = c1 == c2
        && if split_hand { rules.max_hands > 2 && (c1 != 1 || rules.resplit_aces) } else { rules.max_hands >= 2 };
    if split_allowed {
        vals[SPLIT as usize] = unc(split_value(c1, rules, &dp), obo_risk(2.0));
    }
    vals
}

/// Value (conditional on no dealer natural) of splitting a pair of `c`, both hands together.
fn split_value(c: usize, rules: &Rules, dp: &Dp) -> f64 {
    let max_resplits = rules.max_hands.saturating_sub(2) as usize;
    let play = |j: usize| -> f64 {
        let t = c + j;
        let ha = c == 1 || j == 1;
        let eff = eff_total(t as u32, ha) as usize;
        if c == 1 && !rules.hit_split_aces {
            return dp.s[eff];
        }
        let mut best = dp.s[eff].max(dp.h[ha as usize][t]);
        if rules.das && rules.can_double(t as u32, eff != t) {
            best = best.max(double_value(t, ha, dp));
        }
        best
    };
    let can_resplit = if c == 1 { rules.resplit_aces } else { true };
    let mut tv: Option<f64> = None;
    for r in 0..=max_resplits {
        let mut acc = 0.0;
        for j in 1..=10usize {
            let mut w = play(j);
            if j == c && r > 0 && can_resplit {
                if let Some(prev) = tv {
                    w = w.max(prev);
                }
            }
            acc += dp.p[j] * w;
        }
        tv = Some(2.0 * acc);
    }
    tv.unwrap_or(0.0)
}

pub const EPS: f64 = 1e-9;

/// Best legal action; ties go to the simpler action (stand, hit, double, split, surrender).
pub fn best_action(vals: &[f64; 5], exclude: &[u8]) -> Option<u8> {
    let mut best = None;
    let mut bv = f64::NEG_INFINITY;
    for a in [STAND, HIT, DOUBLE, SPLIT, SURRENDER] {
        if exclude.contains(&a) || vals[a as usize].is_nan() {
            continue;
        }
        if vals[a as usize] > bv + EPS {
            bv = vals[a as usize];
            best = Some(a);
        }
    }
    best
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum Kind {
    Hard,
    Soft,
    Pair,
}

/// The two-card hands that make up a strategy cell, with their combinatorial weights.
pub fn cell_combos(kind: Kind, key: usize) -> Vec<(usize, usize, f64)> {
    match kind {
        Kind::Pair => vec![(key, key, 1.0)],
        Kind::Soft => vec![(1, key - 11, 1.0)],
        Kind::Hard => {
            let mut v = vec![];
            for a in 2..=10usize {
                if key < a {
                    continue;
                }
                let b = key - a;
                if b < a || b > 10 || a == b {
                    continue;
                }
                v.push((a, b, 2.0));
            }
            v
        }
    }
}

/// Weighted-average action values for a strategy cell (e.g. hard 16 vs 10) drawn from `base`.
pub fn eval_cell(rules: &Rules, split_hand: bool, kind: Kind, key: usize, up: usize, base: &Comp) -> [f64; 5] {
    let mut acc = [0.0; 5];
    let mut ok = [false; 5];
    let mut wsum = 0.0;
    let mut rem = *base;
    rem[up] -= 1.0;
    for (a, b, mult) in cell_combos(kind, key) {
        let n1 = rem[a];
        let n2 = rem[b] - if a == b { 1.0 } else { 0.0 };
        if n1 <= 0.0 || n2 <= 0.0 {
            continue;
        }
        let w = mult * n1 * n2;
        rem[a] -= 1.0;
        rem[b] -= 1.0;
        let vals = action_values(up, a, b, &rem, rules, split_hand);
        rem[a] += 1.0;
        rem[b] += 1.0;
        for i in 0..5 {
            if !vals[i].is_nan() {
                acc[i] += w * vals[i];
                ok[i] = true;
            }
        }
        wsum += w;
    }
    let mut vals = [f64::NAN; 5];
    for i in 0..5 {
        if ok[i] {
            vals[i] = acc[i] / wsum;
        }
    }
    vals
}

/// The strategy cell a starting hand falls in.
#[inline]
pub fn initial_cell(a: usize, b: usize) -> (Kind, usize) {
    if a == b {
        (Kind::Pair, a)
    } else if (a == 1 || b == 1) && a + b + 10 <= 21 {
        (Kind::Soft, a + b + 10)
    } else {
        (Kind::Hard, a + b)
    }
}

/// Expected value of one round per unit bet from composition `base`, when the player picks
/// actions with `choose(kind, key, up, values) -> action` for the first decision. Insurance is
/// not taken.
pub fn round_ev(rules: &Rules, base: &Comp, mut choose: impl FnMut(Kind, usize, usize, &[f64; 5]) -> u8) -> f64 {
    let n = comp_total(base);
    let mut total = 0.0;
    for up in 1..=10usize {
        let p_up = base[up] / n;
        if p_up <= 0.0 {
            continue;
        }
        let mut r1 = *base;
        r1[up] -= 1.0;
        let n1 = n - 1.0;
        let mut ev_up = 0.0;
        for a in 1..=10usize {
            for b in a..=10usize {
                let na = r1[a];
                let nb = r1[b] - if a == b { 1.0 } else { 0.0 };
                if na <= 0.0 || nb <= 0.0 {
                    continue;
                }
                let p = if a == b { 1.0 } else { 2.0 } * (na / n1) * (nb / (n1 - 1.0));
                let mut r2 = r1;
                r2[a] -= 1.0;
                r2[b] -= 1.0;
                let ev = if a + b == 11 && (a == 1 || b == 1) {
                    let pb = if up == 1 || up == 10 { dealer_dist(up, &r2, rules.h17).p_bj } else { 0.0 };
                    (1.0 - pb) * rules.bj_pays
                } else {
                    let vals = action_values(up, a, b, &r2, rules, false);
                    let (kind, key) = initial_cell(a, b);
                    let mut act = choose(kind, key, up, &vals);
                    if vals[act as usize].is_nan() {
                        act = HIT;
                    }
                    vals[act as usize]
                };
                ev_up += p * ev;
            }
        }
        total += p_up * ev_up;
    }
    total
}

/// Expected value of a round with perfect (composition-dependent) first decisions.
pub fn perfect_round_ev(rules: &Rules, base: &Comp) -> f64 {
    round_ev(rules, base, |_, _, _, v| best_action(v, &[]).unwrap_or(STAND))
}

/// Probability that the hole card is a ten given an ace up, from `comp` (upcard and player
/// cards already removed). Insurance pays 2:1 on half the bet.
pub fn insurance_ev(comp: &Comp) -> f64 {
    let n = comp_total(comp);
    if n <= 0.0 {
        return -0.5;
    }
    let p10 = comp[10] / n;
    0.5 * (3.0 * p10 - 1.0)
}

/// Mean-field composition: `decks_left` decks at count `tc` for a system with mean tags
/// `tags` (points per card value). Scales each rank so the remaining cards carry the count.
pub fn comp_at_count(tc: f64, decks_left: f64, tags: &[f64; 11]) -> Comp {
    // Remaining count must be -tc*decks_left. Scale rank v by (1 - tags[v]*lam).
    let base = fresh_comp(1);
    let s2: f64 = (1..=10).map(|v| base[v] * tags[v] * tags[v]).sum();
    let lam = if s2 > 0.0 { tc / s2 } else { 0.0 };
    let mut c = [0.0; 11];
    for v in 1..=10 {
        c[v] = base[v] * decks_left * (1.0 - tags[v] * lam);
    }
    c
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dealer_distribution_sums_to_one() {
        let comp = {
            let mut c = fresh_comp(6);
            c[6] -= 1.0;
            c
        };
        let r = dealer_dist(6, &comp, false);
        let s: f64 = r.dist.iter().sum();
        assert!((s - 1.0).abs() < 1e-12);
        assert_eq!(r.p_bj, 0.0);
        // Dealer busts about 42% with a 6 up (6 decks S17)
        assert!((r.dist[5] - 0.4208).abs() < 0.003, "bust {}", r.dist[5]);
        let mut c = fresh_comp(6);
        c[1] -= 1.0;
        let ace = dealer_dist(1, &c, false);
        assert!((ace.p_bj - 96.0 / 311.0).abs() < 1e-12);
    }

    #[test]
    fn hilo_mean_field_matches_cutcard_formula() {
        let tags = [0.0, -1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, -1.0];
        let c = comp_at_count(3.0, 2.0, &tags);
        // remaining Hi-Lo count should be -tc*decks = -6
        let rc: f64 = (1..=10).map(|v| c[v] * tags[v]).sum();
        assert!((rc + 6.0).abs() < 1e-9, "rc {rc}");
        // cutcard: c[v] = n_v * d * (1 - tag*tc/40)
        assert!((c[10] - 16.0 * 2.0 * (1.0 + 3.0 / 40.0)).abs() < 1e-9);
    }
}
