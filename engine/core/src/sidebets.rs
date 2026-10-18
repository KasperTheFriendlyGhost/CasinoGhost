//! Exact side-bet analysis from any shoe composition, settlement, effects of removal, a
//! derived count, and a side-count simulator.
//!
//! Every calculator is closed-form over the 52 card types: a few hundred operations, cheap
//! enough to run before every round and millions of times in simulation.

use crate::cards::{Card, Shoe};
use crate::rng::Rng;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SideBet {
    PerfectPairs,
    TwentyOnePlusThree,
    LuckyLadies,
}

pub const ALL: [SideBet; 3] = [SideBet::PerfectPairs, SideBet::TwentyOnePlusThree, SideBet::LuckyLadies];

#[derive(Clone, Debug, Serialize)]
pub struct OutcomeDef {
    pub key: &'static str,
    pub label: &'static str,
}

#[derive(Clone, Debug, Serialize)]
pub struct PaytablePreset {
    pub name: &'static str,
    pub pays: Vec<f64>,
}

impl SideBet {
    pub fn name(self) -> &'static str {
        match self {
            SideBet::PerfectPairs => "Perfect Pairs",
            SideBet::TwentyOnePlusThree => "21+3",
            SideBet::LuckyLadies => "Lucky Ladies",
        }
    }
    pub fn short(self) -> &'static str {
        match self {
            SideBet::PerfectPairs => "PP",
            SideBet::TwentyOnePlusThree => "21+3",
            SideBet::LuckyLadies => "LL",
        }
    }
    pub fn blurb(self) -> &'static str {
        match self {
            SideBet::PerfectPairs => "Pays when your first two cards are a pair.",
            SideBet::TwentyOnePlusThree => "Your two cards plus the dealer upcard as a three-card poker hand.",
            SideBet::LuckyLadies => "Pays when your first two cards total 20; the top prize needs a pair of Q♥ and a dealer blackjack.",
        }
    }
    pub fn outcomes(self) -> Vec<OutcomeDef> {
        let o = |key, label| OutcomeDef { key, label };
        match self {
            SideBet::PerfectPairs => vec![
                o("perfect", "Perfect pair (same suit)"),
                o("colored", "Coloured pair (same colour)"),
                o("mixed", "Mixed pair"),
            ],
            SideBet::TwentyOnePlusThree => vec![
                o("suitedTrips", "Suited three of a kind"),
                o("straightFlush", "Straight flush"),
                o("trips", "Three of a kind"),
                o("straight", "Straight"),
                o("flush", "Flush"),
            ],
            SideBet::LuckyLadies => vec![
                o("qhBj", "Q♥ pair + dealer blackjack"),
                o("qh", "Q♥ pair"),
                o("matched", "Matched 20 (same rank and suit)"),
                o("suited", "Suited 20"),
                o("any", "Any 20"),
            ],
        }
    }
    pub fn presets(self) -> Vec<PaytablePreset> {
        let p = |name, pays: &[f64]| PaytablePreset { name, pays: pays.to_vec() };
        match self {
            SideBet::PerfectPairs => vec![p("25 / 12 / 6", &[25., 12., 6.]), p("30 / 10 / 5", &[30., 10., 5.]), p("25 / 10 / 5", &[25., 10., 5.])],
            SideBet::TwentyOnePlusThree => vec![p("100 / 40 / 30 / 10 / 5", &[100., 40., 30., 10., 5.]), p("Classic 9:1", &[9., 9., 9., 9., 9.])],
            SideBet::LuckyLadies => vec![p("1000 / 125 / 19 / 9 / 4", &[1000., 125., 19., 9., 4.]), p("1000 / 200 / 25 / 10 / 4", &[1000., 200., 25., 10., 4.])],
        }
    }
    pub fn default_pays(self) -> Vec<f64> {
        self.presets().remove(0).pays
    }
}

/// Cards remaining by type (0..52).
pub type Comp52 = [f64; 52];

pub fn fresh52(decks: u32) -> Comp52 {
    [decks as f64; 52]
}

pub fn comp52(shoe: &Shoe) -> Comp52 {
    let mut c = [0.0; 52];
    for (i, n) in shoe.by_type.iter().enumerate() {
        c[i] = *n as f64;
    }
    c
}

#[inline]
fn ti(rank: usize, suit: usize) -> usize {
    (rank - 1) * 4 + suit
}
#[inline]
fn c2(n: f64) -> f64 {
    n * (n - 1.0) / 2.0
}
#[inline]
fn c3(n: f64) -> f64 {
    n * (n - 1.0) * (n - 2.0) / 6.0
}

/// Three-rank straights: A23 … JQK, plus QKA. KA2 does not wrap.
const STRAIGHTS: [[usize; 3]; 12] =
    [[1, 2, 3], [2, 3, 4], [3, 4, 5], [4, 5, 6], [5, 6, 7], [6, 7, 8], [7, 8, 9], [8, 9, 10], [9, 10, 11], [10, 11, 12], [11, 12, 13], [12, 13, 1]];
const QH: usize = (12 - 1) * 4 + 1;

fn pp_combos(c: &Comp52) -> Vec<f64> {
    let (mut perfect, mut colored, mut mixed) = (0.0, 0.0, 0.0);
    for r in 1..=13 {
        let b = (r - 1) * 4;
        let (s, h, d, cl) = (c[b], c[b + 1], c[b + 2], c[b + 3]);
        perfect += c2(s) + c2(h) + c2(d) + c2(cl);
        colored += s * cl + h * d;
        mixed += (s + cl) * (h + d);
    }
    vec![perfect, colored, mixed]
}

fn t213_combos(c: &Comp52) -> Vec<f64> {
    let mut rr = [0.0; 14];
    let mut ss = [0.0; 4];
    let mut suited_trips = 0.0;
    for (i, &n) in c.iter().enumerate() {
        rr[i / 4 + 1] += n;
        ss[i % 4] += n;
        suited_trips += c3(n);
    }
    let mut trips = -suited_trips;
    for r in rr.iter().skip(1) {
        trips += c3(*r);
    }
    let (mut sf, mut straight_all) = (0.0, 0.0);
    for [a, b, d] in STRAIGHTS {
        straight_all += rr[a] * rr[b] * rr[d];
        for s in 0..4 {
            sf += c[ti(a, s)] * c[ti(b, s)] * c[ti(d, s)];
        }
    }
    let flush_all: f64 = ss.iter().map(|&n| c3(n)).sum();
    vec![suited_trips, sf, trips, straight_all - sf, flush_all - sf - suited_trips]
}

fn ll_combos(c: &Comp52, n: f64) -> Vec<f64> {
    let mut tens = 0.0;
    for r in 10..=13 {
        for s in 0..4 {
            tens += c[ti(r, s)];
        }
    }
    let (mut aces, mut nines) = (0.0, 0.0);
    for s in 0..4 {
        aces += c[ti(1, s)];
        nines += c[ti(9, s)];
    }
    let qh_pair = c2(c[QH]);
    let (mut matched, mut suited) = (0.0, 0.0);
    for s in 0..4 {
        for r in 10..=13 {
            let i = ti(r, s);
            if i != QH {
                matched += c2(c[i]);
            }
            for r2 in (r + 1)..=13 {
                suited += c[i] * c[ti(r2, s)];
            }
        }
        suited += c[ti(1, s)] * c[ti(9, s)];
    }
    let total20 = c2(tens) + aces * nines;
    let any = total20 - qh_pair - matched - suited;
    let n2 = n - 2.0;
    let p_bj = if n2 >= 2.0 { 2.0 * (tens - 2.0) * aces / (n2 * (n2 - 1.0)) } else { 0.0 };
    vec![qh_pair * p_bj, qh_pair * (1.0 - p_bj), matched, suited, any]
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SideBetEval {
    /// Probability of each outcome, in `SideBet::outcomes()` order.
    pub probs: Vec<f64>,
    pub p_lose: f64,
    /// Expected value per unit wagered (negative = house edge).
    pub ev: f64,
    /// Standard deviation per unit.
    pub sd: f64,
}

pub fn evaluate(bet: SideBet, c: &Comp52, pays: &[f64]) -> SideBetEval {
    let n: f64 = c.iter().sum();
    let (combos, denom) = match bet {
        SideBet::PerfectPairs => (pp_combos(c), c2(n)),
        SideBet::TwentyOnePlusThree => (t213_combos(c), c3(n)),
        SideBet::LuckyLadies => (ll_combos(c, n), c2(n)),
    };
    let probs: Vec<f64> = combos.iter().map(|&k| if denom > 0.0 { k / denom } else { 0.0 }).collect();
    let p_win: f64 = probs.iter().sum();
    let p_lose = 1.0 - p_win;
    let mut ev = -p_lose;
    let mut m2 = p_lose;
    for (p, pay) in probs.iter().zip(pays) {
        ev += p * pay;
        m2 += p * pay * pay;
    }
    SideBetEval { probs, p_lose, ev, sd: (m2 - ev * ev).max(0.0).sqrt() }
}

#[inline]
pub fn ev(bet: SideBet, c: &Comp52, pays: &[f64]) -> f64 {
    evaluate(bet, c, pays).ev
}

// ----- Settlement --------------------------------------------------------------------------

/// Winning outcome index (in `outcomes()` order), or None for a loss.
pub fn classify(bet: SideBet, player: [Card; 2], up: Card, dealer_blackjack: bool) -> Option<usize> {
    let [a, b] = player;
    match bet {
        SideBet::PerfectPairs => {
            if a.rank != b.rank {
                None
            } else if a.suit == b.suit {
                Some(0)
            } else if a.is_red() == b.is_red() {
                Some(1)
            } else {
                Some(2)
            }
        }
        SideBet::TwentyOnePlusThree => {
            let cards = [a, b, up];
            let same_rank = a.rank == b.rank && b.rank == up.rank;
            let flush = a.suit == b.suit && b.suit == up.suit;
            if same_rank && flush {
                return Some(0);
            }
            let mut ranks: Vec<u8> = cards.iter().map(|c| c.rank).collect();
            ranks.sort_unstable();
            ranks.dedup();
            let straight = ranks.len() == 3 && STRAIGHTS.iter().any(|s| s.iter().all(|r| ranks.contains(&(*r as u8))));
            if straight && flush {
                Some(1)
            } else if same_rank {
                Some(2)
            } else if straight {
                Some(3)
            } else if flush {
                Some(4)
            } else {
                None
            }
        }
        SideBet::LuckyLadies => {
            let is20 = a.value() + b.value() == 20 || (a.rank == 1 && b.rank == 9) || (a.rank == 9 && b.rank == 1);
            if !is20 {
                return None;
            }
            let qh = |x: Card| x.rank == 12 && x.suit == 1;
            if qh(a) && qh(b) {
                Some(if dealer_blackjack { 0 } else { 1 })
            } else if a.rank == b.rank && a.suit == b.suit {
                Some(2)
            } else if a.suit == b.suit {
                Some(3)
            } else {
                Some(4)
            }
        }
    }
}

/// Net units won per unit wagered.
pub fn settle(bet: SideBet, pays: &[f64], player: [Card; 2], up: Card, dealer_blackjack: bool) -> (Option<usize>, f64) {
    match classify(bet, player, up, dealer_blackjack) {
        Some(i) => (Some(i), pays.get(i).copied().unwrap_or(0.0)),
        None => (None, -1.0),
    }
}

// ----- Counting ----------------------------------------------------------------------------

/// Effect on EV of removing one card of each value (1..10), averaged over the suits and
/// ranks sharing it.
pub fn effects_of_removal(bet: SideBet, c: &Comp52, pays: &[f64]) -> [f64; 11] {
    let base = ev(bet, c, pays);
    let mut eor = [0.0; 11];
    let mut weight = [0.0; 11];
    let mut work = *c;
    for i in 0..52 {
        if c[i] <= 0.0 {
            continue;
        }
        let v = crate::cards::VALUE_OF_TYPE[i] as usize;
        work[i] -= 1.0;
        eor[v] += c[i] * (ev(bet, &work, pays) - base);
        weight[v] += c[i];
        work[i] += 1.0;
    }
    for v in 1..=10 {
        if weight[v] > 0.0 {
            eor[v] /= weight[v];
        }
    }
    eor
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DerivedCount {
    /// Tags by value 1..10 (index 0 unused).
    pub tags: [i32; 11],
    /// False when no linear count captures the bet (Perfect Pairs: all ranks symmetric).
    pub countable: bool,
    /// Tag sum over one deck; 0 = balanced.
    pub deck_sum: i32,
}

const FREQ: [f64; 11] = [0., 1., 1., 1., 1., 1., 1., 1., 1., 1., 4.];

/// Integer count of `level` from effects of removal: ideal tags are each value's EOR minus the
/// frequency-weighted mean, scaled to ±level, then rounded up or down (all 2^10 choices tried),
/// preferring a balanced deck, then the smallest rounding error.
pub fn derive_count(eor: &[f64; 11], level: i32) -> DerivedCount {
    let mean: f64 = (1..=10).map(|v| FREQ[v] * eor[v]).sum::<f64>() / 13.0;
    let max_dev = (1..=10).map(|v| (eor[v] - mean).abs()).fold(0.0, f64::max);
    let max_abs = (1..=10).map(|v| eor[v].abs()).fold(0.0, f64::max);
    let countable = max_abs > 0.0 && max_dev / max_abs > 1e-6;
    if !countable {
        return DerivedCount { tags: [0; 11], countable, deck_sum: 0 };
    }
    let ideal: Vec<f64> = (0..=10).map(|v| if v == 0 { 0.0 } else { (eor[v] - mean) / max_dev * level as f64 }).collect();
    let (mut best, mut best_mask) = (f64::INFINITY, 0u32);
    for mask in 0..1024u32 {
        let (mut sum, mut err) = (0.0, 0.0);
        for v in 1..=10 {
            let t = if (mask >> (v - 1)) & 1 == 1 { ideal[v].ceil() } else { ideal[v].floor() };
            sum += FREQ[v] * t;
            err += FREQ[v] * (t - ideal[v]).powi(2);
        }
        let score = sum.abs() * 1000.0 + err;
        if score < best {
            best = score;
            best_mask = mask;
        }
    }
    let mut tags = [0i32; 11];
    let mut deck_sum = 0;
    for v in 1..=10 {
        tags[v] = if (best_mask >> (v - 1)) & 1 == 1 { ideal[v].ceil() } else { ideal[v].floor() } as i32;
        deck_sum += FREQ[v] as i32 * tags[v];
    }
    DerivedCount { tags, countable, deck_sum }
}

// ----- Side-count simulation ---------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SideCountConfig {
    pub bet: SideBet,
    pub pays: Vec<f64>,
    pub decks: u32,
    pub penetration: f64,
    /// Seats at the table, including you.
    pub seats: u32,
    /// Tags by value 1..10.
    pub tags: [i32; 11],
    pub shoes: u64,
    pub seed: u64,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct SideCountBin {
    pub tc: i32,
    pub rounds: u64,
    pub mean_ev: f64,
    /// Share of rounds where the exact EV was positive.
    pub p_positive: f64,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct SideCountResult {
    pub rounds: u64,
    pub base_ev: f64,
    pub bins: Vec<SideCountBin>,
    /// Lowest true count from which every well-populated bin is +EV.
    pub threshold: Option<i32>,
    pub play_freq: f64,
    pub ev_when_playing: f64,
    /// Units won per 100 rounds observed, betting 1 unit at or above the threshold.
    pub gain_per_100: f64,
    /// Same when betting whenever the exact composition is +EV.
    pub perfect_gain_per_100: f64,
    pub perfect_play_freq: f64,
}

const TC_LO: i32 = -12;
const TC_HI: i32 = 20;

fn score(v: &[u8]) -> (u32, bool) {
    let t: u32 = v.iter().map(|&x| x as u32).sum();
    let ace = v.contains(&1);
    if ace && t + 10 <= 21 { (t + 10, true) } else { (t, false) }
}

/// Deals shoes and, before every round, records the true count from `tags` alongside the bet's
/// exact EV for the cards actually left.
pub fn simulate_side_count(cfg: &SideCountConfig) -> SideCountResult {
    let nb = (TC_HI - TC_LO + 1) as usize;
    let threads = rayon::current_num_threads().max(1) as u64;
    let parts: Vec<(Vec<f64>, Vec<f64>, Vec<f64>, u64, f64, u64, f64)> = (0..threads)
        .into_par_iter()
        .map(|t| {
            let shoes = cfg.shoes / threads + if t < cfg.shoes % threads { 1 } else { 0 };
            let size = cfg.decks as usize * 52;
            let cut = ((size as f64 * cfg.penetration) as usize).clamp(10, size.saturating_sub(10));
            let mut shoe = Shoe::new(cfg.decks, cut, Rng::stream(cfg.seed, t));
            let (mut n, mut sum, mut pos) = (vec![0.0; nb], vec![0.0; nb], vec![0.0; nb]);
            let (mut rounds, mut total_ev, mut perfect_rounds, mut perfect_sum) = (0u64, 0.0, 0u64, 0.0);
            for _ in 0..shoes {
                shoe.shuffle();
                let mut rc = 0i32;
                while !shoe.needs_shuffle() {
                    let e = ev(cfg.bet, &comp52(&shoe), &cfg.pays);
                    let tc = (rc as f64 / shoe.decks_left().max(0.25)).floor() as i32;
                    let b = (tc.clamp(TC_LO, TC_HI) - TC_LO) as usize;
                    n[b] += 1.0;
                    sum[b] += e;
                    if e > 0.0 {
                        pos[b] += 1.0;
                        perfect_sum += e;
                        perfect_rounds += 1;
                    }
                    rounds += 1;
                    total_ev += e;
                    deal_round(&mut shoe, cfg.seats, &cfg.tags, &mut rc);
                }
            }
            (n, sum, pos, rounds, total_ev, perfect_rounds, perfect_sum)
        })
        .collect();
    let (mut n, mut sum, mut pos) = (vec![0.0; nb], vec![0.0; nb], vec![0.0; nb]);
    let (mut rounds, mut total_ev, mut perfect_rounds, mut perfect_sum) = (0u64, 0.0, 0u64, 0.0);
    for p in parts {
        for i in 0..nb {
            n[i] += p.0[i];
            sum[i] += p.1[i];
            pos[i] += p.2[i];
        }
        rounds += p.3;
        total_ev += p.4;
        perfect_rounds += p.5;
        perfect_sum += p.6;
    }
    let bins: Vec<SideCountBin> = (0..nb)
        .filter(|&b| n[b] > 0.0)
        .map(|b| SideCountBin { tc: b as i32 + TC_LO, rounds: n[b] as u64, mean_ev: sum[b] / n[b], p_positive: pos[b] / n[b] })
        .collect();
    let min_rounds = (rounds as f64 * 0.0005).max(50.0);
    let solid: Vec<&SideCountBin> = bins.iter().filter(|x| x.rounds as f64 >= min_rounds).collect();
    let mut threshold = None;
    for x in solid.iter().rev() {
        if x.mean_ev > 0.0 {
            threshold = Some(x.tc);
        } else {
            break;
        }
    }
    let (mut play_rounds, mut play_sum) = (0.0, 0.0);
    if let Some(t) = threshold {
        for x in bins.iter().filter(|x| x.tc >= t) {
            play_rounds += x.rounds as f64;
            play_sum += x.mean_ev * x.rounds as f64;
        }
    }
    let r = rounds.max(1) as f64;
    SideCountResult {
        rounds,
        base_ev: total_ev / r,
        bins,
        threshold,
        play_freq: play_rounds / r,
        ev_when_playing: if play_rounds > 0.0 { play_sum / play_rounds } else { 0.0 },
        gain_per_100: play_sum / r * 100.0,
        perfect_gain_per_100: perfect_sum / r * 100.0,
        perfect_play_freq: perfect_rounds as f64 / r,
    }
}

#[inline]
fn see(shoe: &mut Shoe, tags: &[i32; 11], rc: &mut i32) -> u8 {
    let v = shoe.draw().value();
    *rc += tags[v as usize];
    v
}

/// One round's worth of cards: players stand on 17+, or 12+ against a 2–6.
fn deal_round(shoe: &mut Shoe, seats: u32, tags: &[i32; 11], rc: &mut i32) {
    let up = see(shoe, tags, rc);
    let mut hands: Vec<Vec<u8>> = (0..seats).map(|_| vec![see(shoe, tags, rc), see(shoe, tags, rc)]).collect();
    let hole = shoe.draw().value();
    for h in hands.iter_mut() {
        loop {
            let (total, soft) = score(h);
            let stand_at = if (2..=6).contains(&up) { 12 } else { 17 };
            if total > 21 || total > stand_at || (total == stand_at && !(soft && total == 17)) || total == 21 || shoe.cards_left() == 0 {
                break;
            }
            h.push(see(shoe, tags, rc));
        }
    }
    *rc += tags[hole as usize];
    let mut dealer = vec![up, hole];
    while score(&dealer).0 < 17 && shoe.cards_left() > 0 {
        dealer.push(see(shoe, tags, rc));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn published_edges_and_exact_enumeration() {
        let pp = evaluate(SideBet::PerfectPairs, &fresh52(6), &SideBet::PerfectPairs.default_pays());
        assert!((pp.ev + 0.0611).abs() < 0.0001, "PP {}", pp.ev);
        let classic = evaluate(SideBet::TwentyOnePlusThree, &fresh52(6), &[9., 9., 9., 9., 9.]);
        assert!((classic.ev + 0.0324).abs() < 0.0002, "21+3 {}", classic.ev);
        let one = evaluate(SideBet::TwentyOnePlusThree, &fresh52(1), &[9.; 5]);
        let count = |i: usize| (one.probs[i] * 22100.0).round() as i64;
        assert_eq!([count(0), count(1), count(2), count(3), count(4)], [0, 48, 52, 12 * 64 - 48, 4 * 286 - 48]);
        for bet in ALL {
            for d in [1, 2, 6, 8] {
                let e = evaluate(bet, &fresh52(d), &bet.default_pays());
                assert!((e.p_lose + e.probs.iter().sum::<f64>() - 1.0).abs() < 1e-12);
            }
        }
    }

    #[test]
    fn settlement_agrees_with_the_exact_calculator() {
        for bet in ALL {
            let pays = bet.default_pays();
            let exact = evaluate(bet, &fresh52(6), &pays);
            let mut shoe = Shoe::new(6, 300, Rng::new(17));
            let n = 400_000;
            let mut sum = 0.0;
            for _ in 0..n {
                shoe.shuffle();
                let p = [shoe.draw(), shoe.draw()];
                let up = shoe.draw();
                let hole = shoe.draw();
                let bj = (up.value() == 1 && hole.value() == 10) || (up.value() == 10 && hole.value() == 1);
                sum += settle(bet, &pays, p, up, bj).1;
            }
            let mean = sum / n as f64;
            let se = exact.sd / (n as f64).sqrt();
            assert!(((mean - exact.ev) / se).abs() < 4.0, "{}: {mean} vs {}", bet.name(), exact.ev);
        }
    }

    #[test]
    fn derived_counts() {
        let pays = SideBet::LuckyLadies.default_pays();
        let eor = effects_of_removal(SideBet::LuckyLadies, &fresh52(6), &pays);
        let dc = derive_count(&eor, 2);
        assert!(dc.countable && dc.deck_sum == 0);
        assert!(dc.tags[10] < 0, "removing tens hurts Lucky Ladies");
        let pp = effects_of_removal(SideBet::PerfectPairs, &fresh52(6), &SideBet::PerfectPairs.default_pays());
        assert!(!derive_count(&pp, 2).countable);
    }

    #[test]
    fn side_count_finds_a_threshold_for_lucky_ladies() {
        let pays = SideBet::LuckyLadies.default_pays();
        let eor = effects_of_removal(SideBet::LuckyLadies, &fresh52(6), &pays);
        let dc = derive_count(&eor, 2);
        let r = simulate_side_count(&SideCountConfig { bet: SideBet::LuckyLadies, pays, decks: 6, penetration: 0.8, seats: 3, tags: dc.tags, shoes: 6000, seed: 4 });
        assert!(r.rounds > 100_000);
        assert!(r.threshold.is_some());
        assert!(r.gain_per_100 > 0.0 && r.perfect_gain_per_100 > r.gain_per_100);
    }
}
