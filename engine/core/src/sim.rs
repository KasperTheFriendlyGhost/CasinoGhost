//! Card-by-card simulation of a counter at a real table.
//!
//! Every round: other players and the counter are dealt from the shoe, everyone plays (other
//! players by basic strategy, the counter by basic strategy plus index plays at the count they
//! perceive), the dealer plays out and bets settle. The counter flat-bets one unit every round;
//! results are tallied by the count at the time of the bet, so any bet ramp, wonging rule or
//! bankroll can then be evaluated exactly from the table (see `risk`).

use crate::ca::{eff_total, Kind, DOUBLE, HIT, SPLIT, STAND, SURRENDER};
use crate::cards::{Comp, Shoe, VALUE_OF_TYPE};
use crate::count::{bucket, CountSystem, TrueCountMode};
use crate::rng::Rng;
use crate::rules::{Rules, Surrender, TableConditions};
use crate::strategy::{basic_strategy, idx, IndexPlay, Strategy, SZ};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SimConfig {
    pub rules: Rules,
    pub table: TableConditions,
    pub count: CountSystem,
    pub tc_mode: TrueCountMode,
    /// The counter's index plays (in the count system's units) and insurance index.
    pub plays: Vec<IndexPlay>,
    pub insurance_index: Option<f64>,
    pub rounds: u64,
    pub seed: u64,
}

/// Results for one count value. Money is per unit flat bet.
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct CountRow {
    pub count: i32,
    pub rounds: u64,
    /// Sum and sum of squares of the round result (units).
    pub won: f64,
    pub won_sq: f64,
    pub insured: u64,
}

impl CountRow {
    pub fn freq(&self, total: u64) -> f64 {
        if total == 0 { 0.0 } else { self.rounds as f64 / total as f64 }
    }
    pub fn ev(&self) -> f64 {
        if self.rounds == 0 { 0.0 } else { self.won / self.rounds as f64 }
    }
    /// Second moment E[X^2] of the round result.
    pub fn m2(&self) -> f64 {
        if self.rounds == 0 { 1.3 } else { self.won_sq / self.rounds as f64 }
    }
    pub fn var(&self) -> f64 {
        (self.m2() - self.ev().powi(2)).max(0.0)
    }
    /// Standard error of the EV.
    pub fn se(&self) -> f64 {
        if self.rounds < 2 { f64::INFINITY } else { (self.var() / self.rounds as f64).sqrt() }
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SimTotals {
    pub rounds: u64,
    pub shoes: u64,
    pub hands: u64,
    pub wins: u64,
    pub losses: u64,
    pub pushes: u64,
    pub blackjacks: u64,
    pub doubles: u64,
    pub splits: u64,
    pub surrenders: u64,
    pub insurances: u64,
    pub deviations: u64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SimResult {
    pub rows: Vec<CountRow>,
    pub totals: SimTotals,
    pub won: f64,
    pub won_sq: f64,
    pub elapsed_secs: f64,
    pub cancelled: bool,
}

impl SimResult {
    pub fn ev(&self) -> f64 {
        if self.totals.rounds == 0 { 0.0 } else { self.won / self.totals.rounds as f64 }
    }
    pub fn sd(&self) -> f64 {
        let n = self.totals.rounds.max(1) as f64;
        (self.won_sq / n - self.ev().powi(2)).max(0.0).sqrt()
    }
    pub fn se(&self) -> f64 {
        self.sd() / (self.totals.rounds.max(1) as f64).sqrt()
    }
    pub fn row(&self, count: i32) -> Option<&CountRow> {
        self.rows.iter().find(|r| r.count == count)
    }

    fn merge(&mut self, o: &SimResult) {
        if self.rows.is_empty() {
            self.rows = o.rows.clone();
        } else {
            for (a, b) in self.rows.iter_mut().zip(&o.rows) {
                a.rounds += b.rounds;
                a.won += b.won;
                a.won_sq += b.won_sq;
                a.insured += b.insured;
            }
        }
        let (t, u) = (&mut self.totals, &o.totals);
        t.rounds += u.rounds;
        t.shoes += u.shoes;
        t.hands += u.hands;
        t.wins += u.wins;
        t.losses += u.losses;
        t.pushes += u.pushes;
        t.blackjacks += u.blackjacks;
        t.doubles += u.doubles;
        t.splits += u.splits;
        t.surrenders += u.surrenders;
        t.insurances += u.insurances;
        t.deviations += u.deviations;
        self.won += o.won;
        self.won_sq += o.won_sq;
        self.cancelled |= o.cancelled;
    }
}

/// Range of count buckets kept for a system.
pub fn count_range(sys: &CountSystem, decks: u32) -> (i32, i32) {
    if sys.balanced {
        (-15, 15)
    } else {
        let irc = sys.irc2(decks) / 2;
        let pivot_span = (sys.deck_sum2() / 2) * decks as i32;
        (irc - 25, irc + pivot_span + 25)
    }
}

// ----- Fast strategy lookups ---------------------------------------------------------------

#[inline]
fn kind_ix(k: Kind) -> usize {
    match k {
        Kind::Hard => 0,
        Kind::Soft => 1,
        Kind::Pair => 2,
    }
}

/// Strategy tables flattened for the inner loop, plus index plays.
#[derive(Clone)]
pub struct FastStrategy {
    rules: Rules,
    init: [[u8; SZ]; 3],
    init_fb: [[u8; SZ]; 3],
    split: [[u8; SZ]; 3],
    split_fb: [[u8; SZ]; 3],
    multi_hard: [u8; SZ],
    multi_soft: [u8; SZ],
    dev_index: [[f32; SZ]; 3],
    dev_above: [[u8; SZ]; 3],
    dev_below: [[u8; SZ]; 3],
    insurance_index: Option<f64>,
}

fn arr(v: &[u8]) -> [u8; SZ] {
    let mut a = [0u8; SZ];
    a.copy_from_slice(&v[..SZ]);
    a
}

impl FastStrategy {
    pub fn new(rules: &Rules, s: &Strategy, plays: &[IndexPlay], insurance_index: Option<f64>) -> FastStrategy {
        let t3 = |c: &crate::strategy::CtxTables, fb: bool| {
            [Kind::Hard, Kind::Soft, Kind::Pair].map(|k| arr(if fb { &c.get(k).fallback } else { &c.get(k).best }))
        };
        let mut f = FastStrategy {
            rules: rules.clone(),
            init: t3(&s.initial, false),
            init_fb: t3(&s.initial, true),
            split: t3(&s.split, false),
            split_fb: t3(&s.split, true),
            multi_hard: arr(&s.multi_hard),
            multi_soft: arr(&s.multi_soft),
            dev_index: [[f32::NAN; SZ]; 3],
            dev_above: [[0; SZ]; 3],
            dev_below: [[0; SZ]; 3],
            insurance_index,
        };
        for d in plays {
            let k = kind_ix(d.kind);
            let i = idx(d.key, d.up);
            let base = f.init[k][i];
            if base != d.above && base != d.below {
                continue;
            }
            f.dev_index[k][i] = d.index as f32;
            f.dev_above[k][i] = d.above;
            f.dev_below[k][i] = d.below;
        }
        f
    }

    #[inline]
    pub fn insure(&self, count: f64) -> bool {
        self.insurance_index.is_some_and(|i| count >= i - 1e-9)
    }
}

/// A hand in the simulator.
#[derive(Clone, Copy, Default)]
struct SHand {
    total: u32,
    has_ace: bool,
    n: u8,
    c1: u8,
    c2: u8,
    from_split: bool,
    ace_split: bool,
    bet: f64,
    done: bool,
    surrendered: bool,
}

impl SHand {
    #[inline]
    fn add(&mut self, v: u8) {
        self.total += v as u32;
        self.has_ace |= v == 1;
        if self.n == 0 {
            self.c1 = v;
        } else if self.n == 1 {
            self.c2 = v;
        }
        self.n += 1;
    }
    #[inline]
    fn eff(&self) -> u32 {
        eff_total(self.total, self.has_ace)
    }
    #[inline]
    fn natural(&self) -> bool {
        self.n == 2 && !self.from_split && self.eff() == 21
    }
}

/// Decide the action (mirrors `strategy::Advisor::advise`). Returns (action, deviated).
#[inline]
fn decide(f: &FastStrategy, h: &SHand, up: usize, n_hands: u32, count: f64, use_dev: bool) -> (u8, bool) {
    let r = &f.rules;
    let n = h.n;
    let eff = h.eff();
    let soft = eff != h.total;
    let pair = n == 2 && h.c1 == h.c2;
    let can_pair = pair && n_hands < r.max_hands && !(h.c1 == 1 && h.from_split && !r.resplit_aces);
    if h.ace_split && !r.hit_split_aces {
        let rs = n == 2 && h.c2 == 1 && r.resplit_aces && n_hands < r.max_hands;
        return (if rs { SPLIT } else { STAND }, false);
    }
    let can_double = n == 2 && (!h.from_split || r.das) && r.can_double(h.total, soft);
    let can_surr = n == 2 && !h.from_split && r.surrender != Surrender::None;
    let allows = |a: u8| match a {
        DOUBLE => can_double,
        SPLIT => can_pair,
        SURRENDER => can_surr,
        _ => true,
    };
    let (kind, key) = if n == 2 {
        if can_pair { (Kind::Pair, h.c1 as usize) } else if soft { (Kind::Soft, eff as usize) } else { (Kind::Hard, h.total as usize) }
    } else if soft {
        (Kind::Soft, eff as usize)
    } else {
        (Kind::Hard, h.total.min(21) as usize)
    };
    let k = kind_ix(kind);
    let i = idx(key, up);
    let base = if n == 2 {
        if h.from_split { f.split[k][i] } else { f.init[k][i] }
    } else if soft {
        f.multi_soft[i]
    } else {
        f.multi_hard[i]
    };
    let mut act = base;
    let mut dev = false;
    if use_dev && n == 2 && !h.from_split {
        let di = f.dev_index[k][i];
        if !di.is_nan() {
            let want = if count >= di as f64 - 1e-9 { f.dev_above[k][i] } else { f.dev_below[k][i] };
            if allows(want) {
                dev = want != base;
                act = want;
            }
        }
    }
    if !allows(act) {
        let fb = if h.from_split { f.split_fb[k][i] } else { f.init_fb[k][i] };
        act = if act == DOUBLE && fb == STAND { STAND } else { HIT };
    }
    (act, dev)
}

// ----- The table -----------------------------------------------------------------------------

struct Table<'a> {
    cfg: &'a SimConfig,
    me: FastStrategy,
    others: FastStrategy,
    shoe: Shoe,
    rc2: i32,
    irc2: i32,
    lo: i32,
    hi: i32,
    result: SimResult,
    sampler: Option<Sampler>,
}

/// Per-thread reservoir of shoe compositions by count bucket, with exact bucket counts.
pub struct Sampler {
    k: usize,
    lo: i32,
    rng: Rng,
    res: Vec<Vec<Comp>>,
    seen: Vec<u64>,
}

impl Sampler {
    fn new(k: usize, lo: i32, hi: i32, seed: u64) -> Sampler {
        let n = (hi - lo + 1) as usize;
        Sampler { k, lo, rng: Rng::new(seed), res: vec![Vec::new(); n], seen: vec![0; n] }
    }
    #[inline]
    fn offer(&mut self, b: i32, shoe: &Shoe) {
        let i = (b - self.lo) as usize;
        self.seen[i] += 1;
        let n = self.seen[i];
        if self.res[i].len() < self.k {
            self.res[i].push(shoe.comp());
        } else {
            let j = self.rng.below(n.min(u32::MAX as u64) as u32) as usize;
            if j < self.k {
                self.res[i][j] = shoe.comp();
            }
        }
    }
}

impl Table<'_> {
    #[inline]
    fn see(&mut self, t: u8) -> u8 {
        self.rc2 += self.cfg.count.tag2(t);
        VALUE_OF_TYPE[t as usize]
    }
    #[inline]
    fn draw_seen(&mut self) -> u8 {
        let t = self.shoe.draw_type();
        self.see(t)
    }
    #[inline]
    fn count(&self) -> f64 {
        self.cfg.tc_mode.count(&self.cfg.count, self.rc2, self.shoe.cards_left())
    }
    fn shuffle(&mut self) {
        self.shoe.shuffle();
        self.rc2 = self.irc2;
        self.result.totals.shoes += 1;
    }

    /// Play a hand to completion.
    fn play_hand(&mut self, hands: &mut Vec<SHand>, hi: usize, up: usize, me: bool) {
        loop {
            let h = hands[hi];
            if h.done {
                return;
            }
            if h.n < 2 {
                let v = self.draw_seen();
                hands[hi].add(v);
                continue;
            }
            if h.eff() >= 21 {
                hands[hi].done = true;
                return;
            }
            let count = if me { self.count() } else { 0.0 };
            let strat = if me { &self.me } else { &self.others };
            let (act, dev) = decide(strat, &h, up, hands.len() as u32, count, me);
            if me && dev {
                self.result.totals.deviations += 1;
            }
            match act {
                STAND => {
                    hands[hi].done = true;
                    return;
                }
                HIT => {
                    let v = self.draw_seen();
                    hands[hi].add(v);
                    if hands[hi].total > 21 {
                        hands[hi].done = true;
                        return;
                    }
                }
                DOUBLE => {
                    let v = self.draw_seen();
                    hands[hi].add(v);
                    hands[hi].bet *= 2.0;
                    hands[hi].done = true;
                    if me {
                        self.result.totals.doubles += 1;
                    }
                    return;
                }
                SURRENDER => {
                    hands[hi].surrendered = true;
                    hands[hi].done = true;
                    if me {
                        self.result.totals.surrenders += 1;
                    }
                    return;
                }
                _ => {
                    // split: each hand gets its second card when it is played
                    let mut a = SHand { from_split: true, ace_split: h.c1 == 1, bet: h.bet, ..Default::default() };
                    a.add(h.c1);
                    hands[hi] = a;
                    hands.insert(hi + 1, a);
                    if me {
                        self.result.totals.splits += 1;
                    }
                }
            }
        }
    }

    fn round(&mut self) {
        if self.shoe.needs_shuffle() || self.cfg.rules.csm {
            self.shuffle();
        }
        let rules = self.cfg.rules;
        let count0 = self.count();
        let b = bucket(count0, self.lo, self.hi);

        if let Some(s) = self.sampler.as_mut() {
            s.offer(b, &self.shoe);
        }

        let n_others = self.cfg.table.other_players as usize;
        // seats: others first, the counter at third base (acts last)
        let seats = n_others + 1;
        let mut seat_hands: Vec<Vec<SHand>> = (0..seats).map(|_| vec![SHand { bet: 1.0, ..Default::default() }]).collect();
        // one card to each seat, the upcard, a second card to each seat, the hole card
        for s in 0..seats {
            let v = self.draw_seen();
            seat_hands[s][0].add(v);
        }
        let up_t = self.shoe.draw_type();
        let up = self.see(up_t) as usize;
        for s in 0..seats {
            let v = self.draw_seen();
            seat_hands[s][0].add(v);
        }
        let hole_t = self.shoe.draw_type();
        let hole = VALUE_OF_TYPE[hole_t as usize] as usize;
        let dealer_bj = (up == 1 && hole == 10) || (up == 10 && hole == 1);

        let me_ix = seats - 1;
        let mut my_result = 0.0;
        // insurance (offered with an ace up in peek games)
        let mut insured = false;
        if up == 1 && rules.peek && self.me.insure(self.count()) {
            insured = true;
            self.result.totals.insurances += 1;
            my_result += if dealer_bj { 1.0 } else { -0.5 };
        }

        // early surrender happens before the peek
        let mut surrendered_early = false;
        if rules.surrender == Surrender::Early {
            let h = seat_hands[me_ix][0];
            if !h.natural() {
                let (act, _) = decide(&self.me, &h, up, 1, self.count(), true);
                if act == SURRENDER {
                    surrendered_early = true;
                    seat_hands[me_ix][0].surrendered = true;
                    seat_hands[me_ix][0].done = true;
                    self.result.totals.surrenders += 1;
                }
            }
        }

        let peeked_bj = rules.peek && dealer_bj;
        if !peeked_bj {
            for s in 0..seats {
                let me = s == me_ix;
                if seat_hands[s][0].natural() || seat_hands[s][0].done {
                    continue;
                }
                let mut hands = std::mem::take(&mut seat_hands[s]);
                let mut i = 0;
                while i < hands.len() {
                    self.play_hand(&mut hands, i, up, me);
                    i += 1;
                }
                seat_hands[s] = hands;
            }
        }

        // dealer
        self.see(hole_t);
        let mut d_total = (up + hole) as u32;
        let mut d_ace = up == 1 || hole == 1;
        let any_live = !peeked_bj
            && seat_hands.iter().flatten().any(|h| !h.surrendered && !h.natural() && h.total <= 21);
        if any_live && !dealer_bj {
            loop {
                let e = eff_total(d_total, d_ace);
                let soft = e != d_total;
                if e > 17 || (e == 17 && !(soft && rules.h17)) {
                    break;
                }
                let v = self.draw_seen();
                d_total += v as u32;
                d_ace |= v == 1;
            }
        }
        let d_eff = eff_total(d_total, d_ace);

        // settle the counter's hands
        let hands = &seat_hands[me_ix];
        let n_hands = hands.len();
        self.result.totals.hands += n_hands as u64;
        for h in hands {
            let r = if h.surrendered {
                if surrendered_early || !dealer_bj || !rules.peek { -0.5 * h.bet } else { -h.bet }
            } else if h.natural() {
                self.result.totals.blackjacks += 1;
                if dealer_bj { 0.0 } else { rules.bj_pays }
            } else if dealer_bj {
                // no-hole-card: lose doubles and splits too unless original bets only
                if rules.peek || rules.obo { if std::ptr::eq(h, &hands[0]) { -1.0 } else { 0.0 } } else { -h.bet }
            } else if h.total > 21 {
                -h.bet
            } else {
                let e = h.eff();
                if d_eff > 21 || e > d_eff {
                    h.bet
                } else if e < d_eff {
                    -h.bet
                } else {
                    0.0
                }
            };
            if r > 0.0 {
                self.result.totals.wins += 1;
            } else if r < 0.0 {
                self.result.totals.losses += 1;
            } else {
                self.result.totals.pushes += 1;
            }
            my_result += r;
        }

        let row = &mut self.result.rows[(b - self.lo) as usize];
        row.rounds += 1;
        row.won += my_result;
        row.won_sq += my_result * my_result;
        if insured {
            row.insured += 1;
        }
        self.result.won += my_result;
        self.result.won_sq += my_result * my_result;
        self.result.totals.rounds += 1;
    }
}

/// Progress reporting and cancellation shared with the caller. Jobs add to `done`; the caller
/// sets `total` to what the job will count (rounds, or 2x rounds for index generation).
#[derive(Default)]
pub struct Progress {
    pub done: AtomicU64,
    pub total: AtomicU64,
    pub cancel: AtomicBool,
}

impl Progress {
    pub fn fraction(&self) -> f64 {
        let t = self.total.load(Ordering::Relaxed);
        if t == 0 { 0.0 } else { (self.done.load(Ordering::Relaxed) as f64 / t as f64).min(1.0) }
    }
}

fn run_chunk(cfg: &SimConfig, me: &FastStrategy, others: &FastStrategy, rounds: u64, stream: u64, progress: &Progress, sample_k: usize) -> (SimResult, Option<Sampler>) {
    let rules = &cfg.rules;
    let cut = rules.cut_card(cfg.table.other_players);
    let shoe = Shoe::new(rules.decks, cut, Rng::stream(cfg.seed, stream));
    let (lo, hi) = count_range(&cfg.count, rules.decks);
    let irc2 = cfg.count.irc2(rules.decks);
    let sampler = if sample_k > 0 { Some(Sampler::new(sample_k, lo, hi, cfg.seed ^ stream.wrapping_mul(0x9E37))) } else { None };
    let mut t = Table {
        cfg,
        me: me.clone(),
        others: others.clone(),
        shoe,
        rc2: irc2,
        irc2,
        lo,
        hi,
        result: SimResult {
            rows: (lo..=hi).map(|c| CountRow { count: c, ..Default::default() }).collect(),
            ..Default::default()
        },
        sampler,
    };
    t.shuffle();
    t.result.totals.shoes = 0;
    let mut since = 0u64;
    for _ in 0..rounds {
        t.round();
        since += 1;
        if since == 4096 {
            progress.done.fetch_add(since, Ordering::Relaxed);
            since = 0;
            if progress.cancel.load(Ordering::Relaxed) {
                t.result.cancelled = true;
                break;
            }
        }
    }
    progress.done.fetch_add(since, Ordering::Relaxed);
    (t.result, t.sampler)
}

/// Run a simulation on all cores.
pub fn simulate(cfg: &SimConfig, progress: &Progress) -> SimResult {
    let start = std::time::Instant::now();
    let rules = cfg.rules.clone().sanitized();
    let cfg = &SimConfig { rules: rules.clone(), ..cfg.clone() };
    let strategy = basic_strategy(&rules);
    let me = FastStrategy::new(&rules, &strategy, &cfg.plays, if rules.peek { cfg.insurance_index } else { None });
    let others = FastStrategy::new(&rules, &strategy, &[], None);
    let threads = rayon::current_num_threads().max(1) as u64;
    let chunks = (threads * 4).min(cfg.rounds.max(1));
    let per = cfg.rounds / chunks;
    let extra = cfg.rounds % chunks;
    let parts: Vec<SimResult> = (0..chunks)
        .into_par_iter()
        .map(|c| run_chunk(cfg, &me, &others, per + if c < extra { 1 } else { 0 }, c, progress, 0).0)
        .collect();
    let mut out = SimResult::default();
    for p in &parts {
        out.merge(p);
    }
    out.elapsed_secs = start.elapsed().as_secs_f64();
    out
}

/// Shoe compositions met at the start of rounds, by count bucket, and how often each count
/// occurs.
#[derive(Clone, Debug, Default)]
pub struct Samples {
    pub comps: Vec<(i32, Comp)>,
    /// Rounds observed at each count (before thinning).
    pub counts: std::collections::BTreeMap<i32, u64>,
}

impl Samples {
    pub fn freq(&self, b: i32) -> f64 {
        let total: u64 = self.counts.values().sum();
        if total == 0 { 0.0 } else { *self.counts.get(&b).unwrap_or(&0) as f64 / total as f64 }
    }
}

/// Sample up to `per_bucket` compositions at each count from `cfg.rounds` simulated rounds
/// (basic strategy, no index plays).
pub fn sample_compositions(cfg: &SimConfig, per_bucket: usize, progress: &Progress) -> Samples {
    let rules = cfg.rules.sanitized();
    let cfg = &SimConfig { rules, plays: vec![], insurance_index: None, ..cfg.clone() };
    let strategy = basic_strategy(&rules);
    let me = FastStrategy::new(&rules, &strategy, &[], None);
    let threads = rayon::current_num_threads().max(1) as u64;
    let rounds_each = (cfg.rounds / threads).max(1);
    let k_each = per_bucket.div_ceil(threads as usize).max(1);
    let parts: Vec<Sampler> = (0..threads)
        .into_par_iter()
        .filter_map(|c| run_chunk(cfg, &me, &me, rounds_each, 1000 + c, progress, k_each).1)
        .collect();
    let mut out = Samples::default();
    if let Some(first) = parts.first() {
        let lo = first.lo;
        for i in 0..first.res.len() {
            let b = lo + i as i32;
            let seen: u64 = parts.iter().map(|p| p.seen[i]).sum();
            if seen > 0 {
                out.counts.insert(b, seen);
            }
            let mut n = 0;
            for p in &parts {
                for c in &p.res[i] {
                    if n < per_bucket {
                        out.comps.push((b, *c));
                        n += 1;
                    }
                }
            }
        }
    }
    out
}

pub fn shared_progress() -> Arc<Progress> {
    Arc::new(Progress::default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::count::system;
    use crate::strategy::{applicable, house_edge, published_hilo, IndexSet, HILO_INSURANCE_INDEX};

    fn cfg(rules: Rules, others: u32, rounds: u64) -> SimConfig {
        SimConfig {
            rules,
            table: TableConditions { other_players: others, ..Default::default() },
            count: system("hilo"),
            tc_mode: TrueCountMode::default(),
            plays: vec![],
            insurance_index: None,
            rounds,
            seed: 11,
        }
    }

    #[test]
    fn csm_basic_strategy_matches_the_exact_house_edge() {
        // With a continuous shuffler every round comes from a full shoe, so the simulated EV
        // must match the exact engine within sampling error.
        for rules in [
            Rules { csm: true, ..Rules::default() },
            Rules { csm: true, h17: true, surrender: Surrender::Late, ..Rules::default() },
            Rules { csm: true, decks: 2, bj_pays: 1.2, ..Rules::default() },
            Rules { csm: true, peek: false, obo: false, ..Rules::default() },
        ] {
            let exact = -house_edge(&rules, &basic_strategy(&rules));
            let r = simulate(&cfg(rules.clone(), 0, 20_000_000), &Progress::default());
            let z = (r.ev() - exact) / r.se();
            assert!(z.abs() < 4.0, "{}: sim {:.4}% vs exact {:.4}% (z {z:.2}, se {:.4}%)", rules.shorthand(), r.ev() * 100.0, exact * 100.0, r.se() * 100.0);
            assert!((r.sd() - 1.15).abs() < 0.05, "sd {}", r.sd());
        }
    }

    #[test]
    fn counting_shows_edge_rising_with_the_count() {
        let rules = Rules { surrender: Surrender::Late, penetration: 0.8, ..Rules::default() };
        let s = basic_strategy(&rules);
        let mut c = cfg(rules.clone(), 2, 8_000_000);
        c.plays = applicable(&published_hilo(), &rules, &s, IndexSet::I18Fab4);
        c.insurance_index = Some(HILO_INSURANCE_INDEX);
        let r = simulate(&c, &Progress::default());
        let ev = |tc: i32| r.row(tc).unwrap().ev();
        // roughly +0.5% per true count, starting below zero
        assert!(ev(0) < 0.0 && ev(0) > -0.01, "tc0 {}", ev(0));
        assert!(ev(2) > 0.0, "tc2 {}", ev(2));
        let slope = (ev(4) - ev(0)) / 4.0;
        assert!(slope > 0.004 && slope < 0.0075, "slope {slope}");
        assert!(r.totals.deviations > 0 && r.totals.insurances > 0);
        // frequencies sum to one
        let f: f64 = r.rows.iter().map(|x| x.freq(r.totals.rounds)).sum();
        assert!((f - 1.0).abs() < 1e-9);
    }

    #[test]
    fn samples_cover_counts() {
        let c = cfg(Rules::default(), 2, 200_000);
        let s = sample_compositions(&c, 50, &Progress::default());
        assert!(s.comps.iter().any(|(b, _)| *b >= 3) && s.comps.iter().any(|(b, _)| *b <= -3));
        assert!(s.comps.iter().filter(|(b, _)| *b == 0).count() <= 50);
        assert_eq!(s.counts.values().sum::<u64>(), 200_000);
        assert!(s.freq(0) > 0.2 && s.freq(0) < 0.5, "freq(0) {}", s.freq(0));
    }
}
