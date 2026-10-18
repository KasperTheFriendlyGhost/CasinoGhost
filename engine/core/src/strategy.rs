//! Basic strategy generated for any rules, published index plays, and the advisor that
//! decides the correct play for a real hand.

use crate::ca::{self, best_action, eval_cell, Kind, DOUBLE, HIT, SPLIT, STAND, SURRENDER};
use crate::cards::{fresh_comp, Comp};
use crate::rules::{Rules, Surrender};
use serde::{Deserialize, Serialize};

pub const SZ: usize = 22 * 11;
#[inline]
pub fn idx(total: usize, up: usize) -> usize {
    total * 11 + up
}

/// Best, second-best and best-without-double/surrender actions for every cell.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Table {
    pub best: Vec<u8>,
    pub alt: Vec<u8>,
    pub fallback: Vec<u8>,
}

impl Table {
    fn new() -> Table {
        Table { best: vec![STAND; SZ], alt: vec![STAND; SZ], fallback: vec![STAND; SZ] }
    }
    fn put(&mut self, key: usize, up: usize, vals: &[f64; 5]) {
        let i = idx(key, up);
        let best = best_action(vals, &[]).unwrap_or(STAND);
        self.best[i] = best;
        self.alt[i] = best_action(vals, &[best]).unwrap_or(best);
        self.fallback[i] = best_action(vals, &[DOUBLE, SURRENDER]).unwrap_or(STAND);
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CtxTables {
    pub hard: Table,
    pub soft: Table,
    pub pair: Table,
}

impl CtxTables {
    fn new() -> Self {
        CtxTables { hard: Table::new(), soft: Table::new(), pair: Table::new() }
    }
    pub fn get(&self, kind: Kind) -> &Table {
        match kind {
            Kind::Hard => &self.hard,
            Kind::Soft => &self.soft,
            Kind::Pair => &self.pair,
        }
    }
    fn get_mut(&mut self, kind: Kind) -> &mut Table {
        match kind {
            Kind::Hard => &mut self.hard,
            Kind::Soft => &mut self.soft,
            Kind::Pair => &mut self.pair,
        }
    }
}

/// Strategy for every situation: first two cards, hands created by splitting, and hands of
/// three or more cards (hit or stand only).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Strategy {
    pub initial: CtxTables,
    pub split: CtxTables,
    pub multi_hard: Vec<u8>,
    pub multi_soft: Vec<u8>,
}

/// Generate the strategy for `rules` from composition `base` (a full shoe for basic strategy).
pub fn build_strategy(rules: &Rules, base: &Comp) -> Strategy {
    let mut s = Strategy {
        initial: CtxTables::new(),
        split: CtxTables::new(),
        multi_hard: vec![STAND; SZ],
        multi_soft: vec![STAND; SZ],
    };
    for split_hand in [false, true] {
        let tables = if split_hand { &mut s.split } else { &mut s.initial };
        for up in 1..=10usize {
            for t in 5..=21usize {
                tables.get_mut(Kind::Hard).put(t, up, &eval_cell(rules, split_hand, Kind::Hard, t, up, base));
            }
            for t in 13..=20usize {
                tables.get_mut(Kind::Soft).put(t, up, &eval_cell(rules, split_hand, Kind::Soft, t, up, base));
            }
            for r in 1..=10usize {
                let vals = eval_cell(rules, split_hand, Kind::Pair, r, up, base);
                tables.get_mut(Kind::Pair).put(r, up, &vals);
                if r == 1 {
                    // A,A played without splitting: soft 12
                    let mut v2 = vals;
                    v2[SPLIT as usize] = f64::NAN;
                    tables.get_mut(Kind::Soft).put(12, up, &v2);
                }
                if r == 2 {
                    // 2,2 that can't be split is hard 4, which no other two cards make
                    let mut v2 = vals;
                    v2[SPLIT as usize] = f64::NAN;
                    tables.get_mut(Kind::Hard).put(4, up, &v2);
                }
            }
        }
    }
    for up in 1..=10usize {
        let mut rem = *base;
        rem[up] -= 1.0;
        let dd = ca::dealer_dist(up, &rem, rules.h17).dist;
        let dp = ca::solve_dp(&rem, &dd);
        for t in 4..=21usize {
            for a in 0..2usize {
                let eff = ca::eff_total(t as u32, a == 1) as usize;
                if a == 1 && eff == t {
                    continue;
                }
                let hit = dp.h[a][t] > dp.s[eff] + 1e-9;
                let (tab, key) = if a == 1 { (&mut s.multi_soft, eff) } else { (&mut s.multi_hard, t) };
                tab[idx(key, up)] = if hit { HIT } else { STAND };
            }
        }
    }
    s
}

pub fn basic_strategy(rules: &Rules) -> Strategy {
    build_strategy(rules, &fresh_comp(rules.decks))
}

/// House edge (positive = house advantage) with basic strategy, in units of the bet.
pub fn house_edge(rules: &Rules, strategy: &Strategy) -> f64 {
    -ca::round_ev(rules, &fresh_comp(rules.decks), |kind, key, up, _| strategy.initial.get(kind).best[idx(key, up)])
}

/// Chart code for a cell: S, H, D (double else hit), Ds (double else stand), P, R (surrender
/// else hit), Rs, Rp.
pub fn cell_code(t: &Table, key: usize, up: usize) -> &'static str {
    let i = idx(key, up);
    let (b, fb) = (t.best[i], t.fallback[i]);
    match b {
        DOUBLE => {
            if fb == STAND { "Ds" } else { "D" }
        }
        SURRENDER => match fb {
            STAND => "Rs",
            SPLIT => "Rp",
            _ => "R",
        },
        STAND => "S",
        HIT => "H",
        _ => "P",
    }
}

// ----- Index plays ---------------------------------------------------------------------------

/// A count-based change to basic strategy: at count >= `index` play `above`, else `below`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct IndexPlay {
    pub kind: Kind,
    pub key: usize,
    pub up: usize,
    pub index: f64,
    pub above: u8,
    pub below: u8,
    /// Which side basic strategy normally sits on: "below" if the index switches away from
    /// basic strategy as the count rises.
    pub base_below: bool,
    /// i18, fab4, ext, or generated.
    pub set: String,
    /// Only for H17 (Some(true)) or S17 (Some(false)) games.
    pub h17: Option<bool>,
    /// Only in games without surrender.
    pub no_surrender_only: bool,
}

impl IndexPlay {
    pub fn label(&self) -> String {
        let up = if self.up == 1 { "A".to_string() } else { self.up.to_string() };
        let hand = match self.kind {
            Kind::Hard => format!("Hard {}", self.key),
            Kind::Soft => format!("Soft {}", self.key),
            Kind::Pair => {
                let c = if self.key == 1 { "A".to_string() } else { self.key.to_string() };
                format!("{c},{c}")
            }
        };
        format!("{hand} vs {up}")
    }
}

#[allow(clippy::too_many_arguments)]
fn p(set: &str, kind: Kind, key: usize, up: usize, index: f64, above: u8, below: u8, base_below: bool, h17: Option<bool>) -> IndexPlay {
    IndexPlay { kind, key, up, index, above, below, base_below, set: set.into(), h17, no_surrender_only: false }
}

/// Hi-Lo Illustrious 18 and Fab 4 (Schlesinger), plus an extended set. Insurance is separate.
pub fn published_hilo() -> Vec<IndexPlay> {
    use Kind::*;
    let mut v = vec![
        p("i18", Hard, 16, 10, 0., STAND, HIT, true, None),
        p("i18", Hard, 15, 10, 4., STAND, HIT, true, None),
        p("i18", Pair, 10, 5, 5., SPLIT, STAND, true, None),
        p("i18", Pair, 10, 6, 4., SPLIT, STAND, true, None),
        p("i18", Hard, 10, 10, 4., DOUBLE, HIT, true, None),
        p("i18", Hard, 12, 3, 2., STAND, HIT, true, None),
        p("i18", Hard, 12, 2, 3., STAND, HIT, true, None),
        p("i18", Hard, 11, 1, 1., DOUBLE, HIT, true, None),
        p("i18", Hard, 9, 2, 1., DOUBLE, HIT, true, None),
        p("i18", Hard, 10, 1, 4., DOUBLE, HIT, true, None),
        p("i18", Hard, 9, 7, 3., DOUBLE, HIT, true, None),
        p("i18", Hard, 16, 9, 5., STAND, HIT, true, None),
        p("i18", Hard, 13, 2, -1., STAND, HIT, false, None),
        p("i18", Hard, 12, 4, 0., STAND, HIT, false, None),
        p("i18", Hard, 12, 5, -2., STAND, HIT, false, None),
        p("i18", Hard, 12, 6, -1., STAND, HIT, false, None),
        p("i18", Hard, 13, 3, -2., STAND, HIT, false, None),
        p("fab4", Hard, 14, 10, 3., SURRENDER, HIT, true, None),
        p("fab4", Hard, 15, 10, 0., SURRENDER, HIT, false, None),
        p("fab4", Hard, 15, 9, 2., SURRENDER, HIT, true, None),
        p("fab4", Hard, 15, 1, 1., SURRENDER, HIT, true, None),
        p("ext", Pair, 10, 4, 6., SPLIT, STAND, true, None),
        p("ext", Soft, 19, 4, 3., DOUBLE, STAND, true, None),
        p("ext", Soft, 19, 5, 1., DOUBLE, STAND, true, None),
        p("ext", Soft, 19, 6, 0., DOUBLE, STAND, true, Some(false)),
        p("ext", Soft, 17, 2, 1., DOUBLE, HIT, true, None),
        p("ext", Hard, 8, 6, 2., DOUBLE, HIT, true, None),
        p("ext", Hard, 16, 8, 4., SURRENDER, HIT, true, None),
        p("ext", Hard, 16, 9, -1., SURRENDER, HIT, false, None),
        p("ext", Hard, 16, 9, 4., STAND, HIT, true, Some(true)),
        p("ext", Hard, 10, 1, 3., DOUBLE, HIT, true, Some(true)),
        p("ext", Hard, 15, 1, -1., SURRENDER, HIT, false, Some(true)),
    ];
    let mut a = p("ext", Hard, 15, 1, 5., STAND, HIT, true, None);
    a.no_surrender_only = true;
    let mut b = p("ext", Hard, 16, 1, 3., STAND, HIT, true, None);
    b.no_surrender_only = true;
    v.push(a);
    v.push(b);
    v
}

pub const HILO_INSURANCE_INDEX: f64 = 3.0;

/// Which index plays the player uses.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum IndexSet {
    None,
    InsuranceOnly,
    I18,
    I18Fab4,
    Full,
}

/// Keep the plays that apply under these rules (the base action must match basic strategy;
/// surrender plays need surrender; rule-tagged plays override generic ones).
pub fn applicable(plays: &[IndexPlay], rules: &Rules, strategy: &Strategy, set: IndexSet) -> Vec<IndexPlay> {
    let want = |s: &str| match set {
        IndexSet::None | IndexSet::InsuranceOnly => false,
        IndexSet::I18 => s == "i18",
        IndexSet::I18Fab4 => s == "i18" || s == "fab4",
        IndexSet::Full => true,
    };
    let mut out: Vec<IndexPlay> = vec![];
    for d in plays.iter().filter(|d| want(&d.set) || d.set == "generated") {
        if d.h17.is_some_and(|h| h != rules.h17) {
            continue;
        }
        if d.no_surrender_only && rules.surrender != Surrender::None {
            continue;
        }
        if (d.above == SURRENDER || d.below == SURRENDER) && rules.surrender == Surrender::None {
            continue;
        }
        let base = strategy.initial.get(d.kind).best[idx(d.key, d.up)];
        let base_ok = if d.base_below { base == d.below } else { base == d.above };
        if !base_ok {
            continue;
        }
        // a rule-specific entry replaces a generic one for the same play and direction
        if let Some(j) = out.iter().position(|o| o.kind == d.kind && o.key == d.key && o.up == d.up && o.above == d.above && o.base_below == d.base_below) {
            if d.h17.is_some() && out[j].h17.is_none() {
                out[j] = d.clone();
            }
            continue;
        }
        out.push(d.clone());
    }
    out
}

// ----- Advisor -----------------------------------------------------------------------------

/// A hand in play, as the advisor sees it.
#[derive(Clone, Debug, Default)]
pub struct HandView<'a> {
    /// Card values (1..=10).
    pub cards: &'a [u8],
    pub from_split: bool,
    pub ace_split: bool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Legal {
    pub hit: bool,
    pub stand: bool,
    pub double: bool,
    pub split: bool,
    pub surrender: bool,
    /// Split aces that may not be hit: the hand must stand.
    pub forced: bool,
}

impl Legal {
    pub fn allows(&self, a: u8) -> bool {
        match a {
            STAND => self.stand,
            HIT => self.hit,
            DOUBLE => self.double,
            SPLIT => self.split,
            SURRENDER => self.surrender,
            _ => false,
        }
    }
}

pub fn hand_info(cards: &[u8]) -> (u32, bool, u32, bool) {
    let total: u32 = cards.iter().map(|&c| c as u32).sum();
    let ha = cards.contains(&1);
    let eff = ca::eff_total(total, ha);
    (total, ha, eff, eff != total)
}

pub fn legal(rules: &Rules, hand: &HandView, n_hands: u32) -> Legal {
    let n = hand.cards.len();
    let (total, _, _, soft) = hand_info(hand.cards);
    let (c1, c2) = (hand.cards.first().copied().unwrap_or(0), hand.cards.get(1).copied().unwrap_or(0));
    let can_pair = n == 2 && c1 == c2 && n_hands < rules.max_hands && !(c1 == 1 && hand.from_split && !rules.resplit_aces);
    if hand.ace_split && !rules.hit_split_aces {
        let rs = n == 2 && c2 == 1 && rules.resplit_aces && n_hands < rules.max_hands;
        return Legal { hit: false, stand: true, double: false, split: rs, surrender: false, forced: !rs };
    }
    Legal {
        hit: true,
        stand: true,
        double: n == 2 && (!hand.from_split || rules.das) && rules.can_double(total, soft),
        split: can_pair,
        surrender: n == 2 && !hand.from_split && rules.surrender != Surrender::None,
        forced: false,
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Advice {
    pub action: u8,
    /// Basic-strategy action for the cell.
    pub base: u8,
    pub kind: Kind,
    pub key: usize,
    /// The index play that applies here, if any, and whether it changed the play.
    pub index: Option<IndexPlay>,
    pub deviated: bool,
    pub legal: Legal,
}

/// Basic strategy plus index plays for one rule set.
#[derive(Clone, Debug)]
pub struct Advisor {
    pub rules: Rules,
    pub strategy: Strategy,
    pub plays: Vec<IndexPlay>,
    pub insurance_index: Option<f64>,
}

impl Advisor {
    pub fn new(rules: &Rules, plays: Vec<IndexPlay>, insurance_index: Option<f64>) -> Advisor {
        let strategy = basic_strategy(rules);
        Advisor { rules: rules.clone(), strategy, plays, insurance_index }
    }

    /// The published Hi-Lo set for these rules.
    pub fn hilo(rules: &Rules, set: IndexSet) -> Advisor {
        let mut a = Advisor::new(rules, vec![], None);
        a.plays = applicable(&published_hilo(), rules, &a.strategy, set);
        a.insurance_index = if set == IndexSet::None || !rules.peek { None } else { Some(HILO_INSURANCE_INDEX) };
        a
    }

    pub fn cell(&self, hand: &HandView, n_hands: u32) -> (Kind, usize, bool, Legal) {
        let rules = &self.rules;
        let n = hand.cards.len();
        let (total, _, eff, soft) = hand_info(hand.cards);
        let lg = legal(rules, hand, n_hands);
        let (c1, c2) = (hand.cards[0], hand.cards.get(1).copied().unwrap_or(0));
        if n == 2 {
            let pair_ok = c1 == c2 && n_hands < rules.max_hands && !(c1 == 1 && hand.from_split && !rules.resplit_aces);
            if lg.split || pair_ok {
                return (Kind::Pair, c1 as usize, hand.from_split, lg);
            }
            if soft {
                return (Kind::Soft, eff as usize, hand.from_split, lg);
            }
            return (Kind::Hard, total as usize, hand.from_split, lg);
        }
        if soft { (Kind::Soft, eff as usize, false, lg) } else { (Kind::Hard, total as usize, false, lg) }
    }

    fn base_action(&self, hand: &HandView, kind: Kind, key: usize, split_ctx: bool, up: usize) -> u8 {
        if hand.cards.len() == 2 {
            let t = if split_ctx { &self.strategy.split } else { &self.strategy.initial };
            t.get(kind).best[idx(key, up)]
        } else if kind == Kind::Soft {
            self.strategy.multi_soft[idx(key, up)]
        } else {
            self.strategy.multi_hard[idx(key.min(21), up)]
        }
    }

    /// The correct play at count `count` (index plays used when `use_indices`).
    pub fn advise(&self, hand: &HandView, up: usize, n_hands: u32, count: f64, use_indices: bool) -> Advice {
        let (kind, key, split_ctx, lg) = self.cell(hand, n_hands);
        let base = if lg.forced { STAND } else { self.base_action(hand, kind, key, split_ctx, up) };
        let mut act = base;
        let mut index = None;
        let mut deviated = false;
        if !lg.forced && use_indices && hand.cards.len() == 2 && !split_ctx {
            if let Some(d) = self.plays.iter().find(|d| d.kind == kind && d.key == key && d.up == up && (base == d.above || base == d.below)) {
                let want = if count >= d.index - 1e-9 { d.above } else { d.below };
                if lg.allows(want) {
                    deviated = want != base;
                    act = want;
                }
                index = Some(d.clone());
            }
        }
        if !lg.allows(act) {
            // the cell's choice isn't available (e.g. double after three cards): fall back
            act = if act == DOUBLE && lg.stand && self.strategy.initial.get(kind).fallback[idx(key, up)] == STAND {
                STAND
            } else {
                HIT
            };
            if !lg.allows(act) {
                act = STAND;
            }
        }
        Advice { action: act, base, kind, key, index, deviated, legal: lg }
    }

    pub fn insurance_correct(&self, count: f64) -> bool {
        self.insurance_index.is_some_and(|i| count >= i - 1e-9)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chart_row(s: &Strategy, kind: Kind, key: usize) -> String {
        let t = s.initial.get(kind);
        (2..=11).map(|u| cell_code(t, key, if u == 11 { 1 } else { u })).collect::<Vec<_>>().join(" ")
    }

    #[test]
    fn six_deck_s17_das_chart_matches_the_published_chart() {
        let rules = Rules::default();
        let s = basic_strategy(&rules);
        // columns 2..10, A
        assert_eq!(chart_row(&s, Kind::Hard, 16), "S S S S S H H H H H");
        assert_eq!(chart_row(&s, Kind::Hard, 12), "H H S S S H H H H H");
        assert_eq!(chart_row(&s, Kind::Hard, 11), "D D D D D D D D D H");
        assert_eq!(chart_row(&s, Kind::Hard, 10), "D D D D D D D D H H");
        assert_eq!(chart_row(&s, Kind::Hard, 9), "H D D D D H H H H H");
        assert_eq!(chart_row(&s, Kind::Soft, 18), "S Ds Ds Ds Ds S S H H H");
        assert_eq!(chart_row(&s, Kind::Soft, 17), "H D D D D H H H H H");
        assert_eq!(chart_row(&s, Kind::Soft, 13), "H H H D D H H H H H");
        assert_eq!(chart_row(&s, Kind::Pair, 9), "P P P P P S P P S S");
        assert_eq!(chart_row(&s, Kind::Pair, 8), "P P P P P P P P P P");
        assert_eq!(chart_row(&s, Kind::Pair, 4), "H H H P P H H H H H");
        assert_eq!(chart_row(&s, Kind::Pair, 2), "P P P P P P H H H H");
    }

    #[test]
    fn surrender_and_h17_differences() {
        let rules = Rules { h17: true, surrender: Surrender::Late, ..Rules::default() };
        let s = basic_strategy(&rules);
        assert_eq!(chart_row(&s, Kind::Hard, 16), "S S S S S H H R R R");
        assert_eq!(chart_row(&s, Kind::Hard, 15), "S S S S S H H H R R");
        assert_eq!(chart_row(&s, Kind::Hard, 11), "D D D D D D D D D D");
        assert_eq!(chart_row(&s, Kind::Soft, 19), "S S S S Ds S S S S S");
        assert_eq!(chart_row(&s, Kind::Pair, 8), "P P P P P P P P P Rp");
    }

    #[test]
    fn published_house_edges() {
        let he = |r: Rules| house_edge(&r, &basic_strategy(&r)) * 100.0;
        let base = he(Rules::default());
        assert!((base - 0.40).abs() < 0.02, "6D S17 DAS {base}");
        let eight = he(Rules { decks: 8, ..Rules::default() });
        assert!((eight - 0.43).abs() < 0.02, "8D {eight}");
        let h17 = he(Rules { h17: true, ..Rules::default() }) - base;
        assert!((h17 - 0.21).abs() < 0.03, "H17 penalty {h17}");
        let six5 = he(Rules { bj_pays: 1.2, ..Rules::default() }) - base;
        assert!((six5 - 1.37).abs() < 0.05, "6:5 penalty {six5}");
        let ls = he(Rules { surrender: Surrender::Late, ..Rules::default() }) - base;
        assert!((ls + 0.07).abs() < 0.02, "LS {ls}");
        let nodas = he(Rules { das: false, ..Rules::default() }) - base;
        assert!((nodas - 0.14).abs() < 0.02, "no DAS {nodas}");
        let enhc = he(Rules { peek: false, obo: false, ..Rules::default() }) - base;
        assert!((enhc - 0.11).abs() < 0.03, "ENHC {enhc}");
    }

    #[test]
    fn published_indices_apply_by_rules() {
        let s17 = Advisor::hilo(&Rules::default(), IndexSet::I18Fab4);
        assert_eq!(s17.plays.iter().filter(|p| p.set == "fab4").count(), 0, "no surrender, no Fab 4");
        assert!(s17.plays.iter().any(|p| p.label() == "Hard 16 vs 10"));
        let h17 = Advisor::hilo(&Rules { h17: true, surrender: Surrender::Late, ..Rules::default() }, IndexSet::I18Fab4);
        // H17 basic strategy already doubles 11 vs A, so that index drops out
        assert!(!h17.plays.iter().any(|p| p.label() == "Hard 11 vs A"));
        // ...and basic strategy already surrenders 15 vs A, so that Fab 4 entry drops out too
        assert_eq!(h17.plays.iter().filter(|p| p.set == "fab4").count(), 3);
        assert!(!h17.plays.iter().any(|p| p.set == "fab4" && p.label() == "Hard 15 vs A"));
    }

    #[test]
    fn advisor_uses_indices() {
        let a = Advisor::hilo(&Rules::default(), IndexSet::I18);
        let h = HandView { cards: &[10, 6], ..Default::default() };
        assert_eq!(a.advise(&h, 10, 1, -1.0, true).action, HIT);
        let adv = a.advise(&h, 10, 1, 0.0, true);
        assert_eq!(adv.action, STAND);
        assert!(adv.deviated);
        // three-card 16 vs 10 can't use the two-card index
        let h3 = HandView { cards: &[4, 2, 10], ..Default::default() };
        assert_eq!(a.advise(&h3, 10, 1, 5.0, true).action, HIT);
        // 10,10 vs 6 splits at +4
        let tt = HandView { cards: &[10, 10], ..Default::default() };
        assert_eq!(a.advise(&tt, 6, 1, 4.0, true).action, SPLIT);
        assert_eq!(a.advise(&tt, 6, 1, 3.0, true).action, STAND);
        assert!(a.insurance_correct(3.0) && !a.insurance_correct(2.0));
    }
}
