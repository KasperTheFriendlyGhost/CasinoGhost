//! The interactive table: one player seat (up to four hands after splits), optional other
//! players who play basic strategy, side bets, any count system, and grading of every decision
//! against basic strategy plus index plays, with mistakes priced exactly from the cards left.
//!
//! Every command appends `Event`s (cards dealt, the hole card turned, results) that the app
//! plays back as animation.

use crate::ca::{self, DOUBLE, HIT, SPLIT, STAND, SURRENDER};
use crate::cards::{Card, Comp, Shoe, ShoeState};
use crate::count::{CountSystem, TrueCountMode};
use crate::edge::EdgeModel;
use crate::rng::Rng;
use crate::rules::{Rules, Surrender};
use crate::sidebets::{self, SideBet};
use crate::strategy::{hand_info, Advisor, HandView, IndexPlay, Legal};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Phase {
    Betting,
    Insurance,
    Player,
    Settled,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Outcome {
    Blackjack,
    Win,
    Push,
    Lose,
    Bust,
    Surrender,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Seat {
    Dealer,
    Player,
    Bot(u8),
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum Event {
    /// The shoe was shuffled; counts restart (values after the shuffle).
    Shuffle { running_count: f64, count: f64 },
    /// A card was dealt. The counts and cards left are as they stand after this card.
    Card { seat: Seat, hand: u8, card: Card, face_up: bool, running_count: f64, count: f64, cards_left: u32 },
    /// A hand was split into two; the second hand takes the second card.
    Split { seat: Seat, hand: u8 },
    HoleRevealed { card: Card, running_count: f64, count: f64 },
    Settled { net: f64 },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Hand {
    pub cards: Vec<Card>,
    pub bet: f64,
    pub doubled: bool,
    pub from_split: bool,
    pub ace_split: bool,
    pub done: bool,
    pub surrendered: bool,
    pub outcome: Option<Outcome>,
    pub net: f64,
}

impl Hand {
    fn new(bet: f64) -> Hand {
        Hand { cards: vec![], bet, doubled: false, from_split: false, ace_split: false, done: false, surrendered: false, outcome: None, net: 0.0 }
    }
    pub fn values(&self) -> Vec<u8> {
        self.cards.iter().map(|c| c.value()).collect()
    }
    /// (best total, soft)
    pub fn total(&self) -> (u32, bool) {
        let (_, _, eff, soft) = hand_info(&self.values());
        (eff, soft)
    }
    pub fn is_natural(&self) -> bool {
        !self.from_split && self.cards.len() == 2 && self.total().0 == 21
    }
    pub fn busted(&self) -> bool {
        self.total().0 > 21
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Category {
    Hard,
    Soft,
    Pair,
    Insurance,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Decision {
    pub spot: String,
    pub chosen: String,
    pub best: String,
    pub correct: bool,
    /// Expected cost of the mistake, in units of the bet (0 when correct).
    pub ev_cost: f64,
    /// The index play that decided it, e.g. "TC ≥ +4".
    pub index: Option<String>,
    pub count: f64,
    pub category: Category,
    pub index_spot: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Tally {
    pub n: u32,
    pub ok: u32,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Stats {
    pub rounds: u32,
    pub decisions: u32,
    pub correct: u32,
    /// Dollars of expected value given up by mistakes.
    pub ev_lost: f64,
    pub net: f64,
    pub side_net: f64,
    pub side_staked: f64,
    pub wagered: f64,
    pub hands: u32,
    pub wins: u32,
    pub losses: u32,
    pub pushes: u32,
    pub blackjacks: u32,
    pub busts: u32,
    pub surrenders: u32,
    pub doubles: u32,
    pub splits: u32,
    pub insurances: u32,
    pub side_wins: u32,
    pub hard: Tally,
    pub soft: Tally,
    pub pair: Tally,
    pub insurance: Tally,
    pub index: Tally,
}

/// One settled round, for charts and session analysis.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct RoundRecord {
    pub n: u32,
    /// Active session milliseconds when the round settled.
    pub t: f64,
    pub bet: f64,
    pub side_stake: f64,
    /// The count the player saw before the deal.
    pub count: f64,
    pub net: f64,
    pub bankroll: f64,
    /// Cumulative cost of mistakes after this round (dollars).
    pub error_cost: f64,
    /// Expected result of the round given the count and the play (dollars).
    pub ev: f64,
    pub variance: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SideResult {
    pub bet: SideBet,
    pub stake: f64,
    pub outcome: Option<usize>,
    pub label: String,
    pub net: f64,
    pub ev_before: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct GameSettings {
    pub rules: Rules,
    pub count: CountSystem,
    pub tc_mode: TrueCountMode,
    /// Index plays in the count system's units, and the insurance index.
    pub plays: Vec<IndexPlay>,
    pub insurance_index: Option<f64>,
    pub use_indices: bool,
    /// Paytables in `sidebets::ALL` order.
    pub pays: Vec<Vec<f64>>,
    pub min_bet: f64,
    pub max_bet: f64,
    /// Other players at the table (play basic strategy, act before you).
    pub bots: u32,
}

/// What is saved between visits.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Snapshot {
    pub bankroll: f64,
    pub main_bet: f64,
    pub side_stakes: Vec<f64>,
    pub stats: Stats,
    pub log: Vec<Decision>,
    pub rounds: Vec<RoundRecord>,
    pub elapsed_ms: f64,
    pub shoe: Option<ShoeState>,
    pub rc2: i32,
}

const MAX_ROUNDS: usize = 2000;
const MAX_LOG: usize = 50;

pub struct Game {
    pub settings: GameSettings,
    pub advisor: Advisor,
    pub shoe: Shoe,
    pub phase: Phase,
    pub dealer: Vec<Card>,
    pub hole_revealed: bool,
    pub hands: Vec<Hand>,
    pub active: usize,
    pub bots: Vec<Vec<Hand>>,
    pub bankroll: f64,
    pub main_bet: f64,
    pub side_stakes: Vec<f64>,
    pub side_results: Vec<SideResult>,
    pub insurance: Option<f64>,
    /// Running count in half-points (from the system's initial count).
    pub rc2: i32,
    pub just_shuffled: bool,
    pub last_decision: Option<Decision>,
    pub log: Vec<Decision>,
    pub stats: Stats,
    pub rounds: Vec<RoundRecord>,
    pub round_net: f64,
    /// The player took an action this round (false if it ended on the deal).
    pub acted: bool,
    pub edge_model: Option<EdgeModel>,
    pub base_edge: f64,
    events: Vec<Event>,
    side_evs_before: Vec<f64>,
    pending_peek: bool,
    round_start: (f64, f64, f64, f64, f64),
    clock_base_ms: f64,
    clock_started: Option<std::time::Instant>,
}

fn now() -> std::time::Instant {
    std::time::Instant::now()
}

impl Game {
    pub fn new(settings: GameSettings, rng: Rng) -> Game {
        let rules = settings.rules.sanitized();
        let settings = GameSettings { rules, ..settings };
        let mut advisor = Advisor::new(&rules, settings.plays.clone(), if rules.peek { settings.insurance_index } else { None });
        advisor.plays = crate::strategy::applicable(&settings.plays, &rules, &advisor.strategy, crate::strategy::IndexSet::Full);
        let base_edge = -crate::strategy::house_edge(&rules, &advisor.strategy);
        let cut = rules.cut_card(settings.bots);
        let shoe = Shoe::new(rules.decks, cut, rng);
        let irc2 = settings.count.irc2(rules.decks);
        Game {
            advisor,
            shoe,
            phase: Phase::Betting,
            dealer: vec![],
            hole_revealed: false,
            hands: vec![],
            active: 0,
            bots: vec![],
            bankroll: 1000.0,
            main_bet: settings.min_bet.max(1.0),
            side_stakes: vec![0.0; 3],
            side_results: vec![],
            insurance: None,
            rc2: irc2,
            just_shuffled: true,
            last_decision: None,
            log: vec![],
            stats: Stats::default(),
            rounds: vec![],
            round_net: 0.0,
            acted: false,
            edge_model: None,
            base_edge,
            events: vec![],
            side_evs_before: vec![0.0; 3],
            pending_peek: false,
            round_start: (0.0, 0.0, 0.0, 0.0, 0.0),
            clock_base_ms: 0.0,
            clock_started: Some(now()),
            settings,
        }
    }

    // ----- clock and persistence ------------------------------------------------------------

    pub fn elapsed_ms(&self) -> f64 {
        self.clock_base_ms + self.clock_started.map(|s| s.elapsed().as_secs_f64() * 1000.0).unwrap_or(0.0)
    }
    pub fn paused(&self) -> bool {
        self.clock_started.is_none()
    }
    pub fn pause(&mut self) {
        if self.clock_started.is_some() {
            self.clock_base_ms = self.elapsed_ms();
            self.clock_started = None;
        }
    }
    pub fn resume(&mut self) {
        if self.clock_started.is_none() {
            self.clock_started = Some(now());
        }
    }

    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            bankroll: self.bankroll,
            main_bet: self.main_bet,
            side_stakes: self.side_stakes.clone(),
            stats: self.stats.clone(),
            log: self.log.clone(),
            rounds: self.rounds.clone(),
            elapsed_ms: self.elapsed_ms(),
            shoe: Some(self.shoe.save()),
            rc2: self.rc2,
        }
    }

    /// Restore a session. The shoe is kept only if it fits the current rules.
    pub fn restore(&mut self, s: &Snapshot) {
        self.bankroll = s.bankroll;
        self.main_bet = s.main_bet;
        if s.side_stakes.len() == 3 {
            self.side_stakes = s.side_stakes.clone();
        }
        self.stats = s.stats.clone();
        self.log = s.log.clone();
        self.rounds = s.rounds.clone();
        self.clock_base_ms = s.elapsed_ms;
        if self.clock_started.is_some() {
            self.clock_started = Some(now());
        }
        if let Some(sh) = &s.shoe {
            if self.shoe.load(sh) {
                self.rc2 = s.rc2;
                self.just_shuffled = self.shoe.dealt() == 0;
            }
        }
    }

    pub fn reset_session(&mut self, bankroll: f64) {
        self.stats = Stats::default();
        self.rounds.clear();
        self.log.clear();
        self.last_decision = None;
        self.bankroll = bankroll;
        self.clock_base_ms = 0.0;
        self.clock_started = Some(now());
    }

    pub fn take_events(&mut self) -> Vec<Event> {
        std::mem::take(&mut self.events)
    }

    // ----- derived state ----------------------------------------------------------------------

    pub fn up(&self) -> Option<Card> {
        self.dealer.first().copied()
    }
    /// Running count in points (may be a half for Wong Halves).
    pub fn running_count(&self) -> f64 {
        self.rc2 as f64 / 2.0
    }
    /// The count the player acts on (true count, or running count for unbalanced systems).
    pub fn count(&self) -> f64 {
        self.settings.tc_mode.count(&self.settings.count, self.rc2, self.shoe.cards_left())
    }
    pub fn true_count_exact(&self) -> f64 {
        (self.rc2 as f64 / 2.0) / self.shoe.decks_left().max(0.25)
    }
    pub fn decks_estimate(&self) -> f64 {
        self.settings.tc_mode.decks_estimate(self.shoe.cards_left())
    }
    pub fn on_table(&self) -> usize {
        self.dealer.len() + self.hands.iter().map(|h| h.cards.len()).sum::<usize>() + self.bots.iter().flatten().map(|h| h.cards.len()).sum::<usize>()
    }
    pub fn in_tray(&self) -> usize {
        self.shoe.dealt().saturating_sub(self.on_table())
    }
    pub fn active_hand(&self) -> Option<&Hand> {
        if self.phase == Phase::Player { self.hands.get(self.active) } else { None }
    }

    /// The composition the player can't see: undealt cards plus the face-down hole card.
    pub fn unseen_comp(&self) -> Comp {
        let mut c = self.shoe.comp();
        if !self.hole_revealed {
            if let Some(h) = self.dealer.get(1) {
                c[h.value() as usize] += 1.0;
            }
        }
        c
    }

    /// Expected edge at the current count from the edge model (or the linear rule of thumb).
    pub fn estimated_edge(&self) -> f64 {
        match &self.edge_model {
            Some(m) => m.edge_at(self.count()),
            None => self.base_edge + 0.005 * if self.settings.count.balanced { self.count() } else { 0.0 },
        }
    }

    /// Exact edge of the next round from the actual undealt cards (a few milliseconds).
    pub fn exact_edge(&self) -> f64 {
        let plays: &[IndexPlay] = if self.settings.use_indices { &self.advisor.plays } else { &[] };
        crate::edge::exact_edge(&self.settings.rules, &self.shoe.comp(), &self.advisor.strategy, plays, self.advisor.insurance_index, self.count())
    }

    pub fn side_bet_evs(&self) -> Vec<f64> {
        let c = sidebets::comp52(&self.shoe);
        sidebets::ALL.iter().enumerate().map(|(i, b)| sidebets::ev(*b, &c, &self.settings.pays[i])).collect()
    }

    fn view(h: &Hand) -> (Vec<u8>, bool, bool) {
        (h.values(), h.from_split, h.ace_split)
    }

    pub fn legal(&self) -> Option<Legal> {
        let h = self.active_hand()?;
        let (vals, fs, asp) = Self::view(h);
        Some(crate::strategy::legal(&self.settings.rules, &HandView { cards: &vals, from_split: fs, ace_split: asp }, self.hands.len() as u32))
    }

    /// The correct play for the active hand, and the index that decided it.
    pub fn advice(&self) -> Option<(u8, Option<String>)> {
        let h = self.active_hand()?;
        let (a, idx, ..) = self.correct_play(h);
        Some((a, idx))
    }

    /// Correct action, index label, exact values of each action, category, index spot.
    fn correct_play(&self, h: &Hand) -> (u8, Option<String>, [f64; 5], Category, bool) {
        let up = self.up().map(|c| c.value() as usize).unwrap_or(10);
        let (vals, fs, asp) = Self::view(h);
        let view = HandView { cards: &vals, from_split: fs, ace_split: asp };
        let count = self.count();
        let adv = self.advisor.advise(&view, up, self.hands.len() as u32, count, self.settings.use_indices);
        let ev = self.exact_values(h, up);
        let mut action = adv.action;
        if !adv.legal.allows(action) || ev[action as usize].is_nan() && action != STAND {
            // fall back to the best legal action by value
            action = [STAND, HIT, DOUBLE].into_iter().filter(|a| adv.legal.allows(*a) && !ev[*a as usize].is_nan()).max_by(|a, b| ev[*a as usize].partial_cmp(&ev[*b as usize]).unwrap()).unwrap_or(STAND);
        }
        let index = adv.index.as_ref().filter(|_| adv.deviated).map(|d| {
            let s = if count >= d.index - 1e-9 { "≥" } else { "<" };
            let v = if d.index > 0.0 { format!("+{}", d.index) } else { format!("{}", d.index) };
            let label = if self.settings.count.balanced { "TC" } else { "RC" };
            format!("{label} {s} {v}")
        });
        let cat = match adv.kind {
            ca::Kind::Hard => Category::Hard,
            ca::Kind::Soft => Category::Soft,
            ca::Kind::Pair => Category::Pair,
        };
        (action, index, ev, cat, adv.index.is_some())
    }

    /// Exact value of each action for this hand from the unseen cards (NaN = not applicable).
    fn exact_values(&self, h: &Hand, up: usize) -> [f64; 5] {
        let comp = self.unseen_comp();
        let vals = h.values();
        let rules = &self.settings.rules;
        if vals.len() == 2 {
            let mut v = ca::action_values(up, vals[0] as usize, vals[1] as usize, &comp, rules, h.from_split);
            // values are unconditional on a dealer natural; once the dealer has peeked, that's
            // already ruled out, which shifts all values equally and doesn't change the ranking
            if h.from_split || self.hands.len() > 1 {
                v[SURRENDER as usize] = f64::NAN;
            }
            v
        } else {
            let dd = ca::dealer_dist(up, &comp, rules.h17).dist;
            let dp = ca::solve_dp(&comp, &dd);
            let (t, ha, eff, _) = hand_info(&vals);
            let mut v = [f64::NAN; 5];
            v[STAND as usize] = dp.s[eff.min(21) as usize];
            if t <= 21 {
                v[HIT as usize] = dp.h[ha as usize][t as usize];
            }
            v
        }
    }

    pub fn describe(h: &Hand, up: u8) -> String {
        let vals = h.values();
        let (t, _, eff, soft) = hand_info(&vals);
        let pair = vals.len() == 2 && vals[0] == vals[1];
        let up = if up == 1 { "A".to_string() } else { up.to_string() };
        let label = if pair {
            match vals[0] {
                1 => "Pair of aces".to_string(),
                10 => "Pair of tens".to_string(),
                v => format!("Pair of {v}s"),
            }
        } else if soft {
            format!("Soft {eff}")
        } else {
            format!("Hard {t}")
        };
        format!("{label} vs {up}")
    }

    // ----- setup ------------------------------------------------------------------------------

    fn can_bet(&self) -> bool {
        matches!(self.phase, Phase::Betting | Phase::Settled)
    }
    pub fn set_bet(&mut self, amount: f64) {
        if self.can_bet() {
            self.main_bet = amount.clamp(0.0, self.settings.max_bet);
        }
    }
    pub fn set_side_stake(&mut self, bet: usize, amount: f64) {
        if self.can_bet() && bet < 3 {
            self.side_stakes[bet] = amount.max(0.0);
        }
    }

    pub fn new_shoe(&mut self) {
        self.shoe.shuffle();
        self.rc2 = self.settings.count.irc2(self.settings.rules.decks);
        self.just_shuffled = true;
        self.phase = Phase::Betting;
        self.dealer.clear();
        self.hands.clear();
        self.bots.clear();
        self.side_results.clear();
        let (running_count, count) = (self.running_count(), self.count());
        self.events.push(Event::Shuffle { running_count, count });
    }

    fn see(&mut self, c: Card) -> Card {
        self.rc2 += self.settings.count.tag2(c.card_type());
        c
    }
    fn draw_to(&mut self, seat: Seat, hand: u8, face_up: bool) -> Card {
        let c = self.shoe.draw();
        if face_up {
            self.see(c);
        }
        let (running_count, count, cards_left) = (self.running_count(), self.count(), self.shoe.cards_left() as u32);
        self.events.push(Event::Card { seat, hand, card: c, face_up, running_count, count, cards_left });
        c
    }

    // ----- round flow -------------------------------------------------------------------------

    pub fn deal(&mut self) -> bool {
        if !self.can_bet() || self.main_bet <= 0.0 || self.main_bet < self.settings.min_bet {
            return false;
        }
        self.resume();
        self.just_shuffled = false;
        if self.shoe.needs_shuffle() || self.settings.rules.csm {
            self.new_shoe();
        }
        let count0 = self.count();
        let comp52 = sidebets::comp52(&self.shoe);
        let (mut side_stake, mut side_ev, mut side_var) = (0.0, 0.0, 0.0);
        let mut evs = vec![0.0; 3];
        for (i, b) in sidebets::ALL.iter().enumerate() {
            let e = sidebets::evaluate(*b, &comp52, &self.settings.pays[i]);
            evs[i] = e.ev;
            let st = self.side_stakes[i];
            if st > 0.0 {
                side_stake += st;
                side_ev += st * e.ev;
                side_var += (st * e.sd).powi(2);
            }
        }
        self.round_start = (self.main_bet, side_stake, count0, side_ev, side_var);
        self.stats.wagered += self.main_bet + side_stake;
        self.side_results.clear();
        self.insurance = None;
        self.last_decision = None;
        self.round_net = 0.0;
        self.hole_revealed = false;
        self.acted = false;
        self.pending_peek = false;

        let n_bots = self.settings.bots as usize;
        self.bots = (0..n_bots).map(|_| vec![Hand::new(1.0)]).collect();
        self.hands = vec![Hand::new(self.main_bet)];
        self.dealer.clear();
        // one card each (bots first), upcard, second card each, hole card
        for pass in 0..2 {
            for b in 0..n_bots {
                let c = self.draw_to(Seat::Bot(b as u8), 0, true);
                self.bots[b][0].cards.push(c);
            }
            let c = self.draw_to(Seat::Player, 0, true);
            self.hands[0].cards.push(c);
            let dc = self.draw_to(Seat::Dealer, 0, pass == 0);
            self.dealer.push(dc);
        }
        self.active = 0;
        self.side_evs_before = evs;
        for b in [0usize, 1] {
            self.settle_side(b);
        }

        let up = self.dealer[0].value();
        if up == 1 && self.settings.rules.peek {
            self.phase = Phase::Insurance;
            return true;
        }
        self.after_insurance();
        true
    }

    pub fn take_insurance(&mut self, take: bool) {
        if self.phase != Phase::Insurance {
            return;
        }
        let count = self.count();
        let correct_take = self.advisor.insurance_correct(count);
        let label = if self.settings.count.balanced { "TC" } else { "RC" };
        self.record(Decision {
            spot: "Insurance".into(),
            chosen: if take { "Take" } else { "Decline" }.into(),
            best: if correct_take { "Take" } else { "Decline" }.into(),
            correct: take == correct_take,
            ev_cost: if take == correct_take { 0.0 } else { ca::insurance_ev(&self.unseen_comp()).abs() },
            index: self.advisor.insurance_index.filter(|_| correct_take).map(|i| format!("Insurance at {label} ≥ {i}")),
            count,
            category: Category::Insurance,
            index_spot: self.advisor.insurance_index.is_some(),
        });
        if take {
            self.insurance = Some(self.main_bet / 2.0);
            self.stats.insurances += 1;
            self.stats.wagered += self.main_bet / 2.0;
        }
        self.after_insurance();
    }

    fn dealer_has_bj(&self) -> bool {
        let (a, b) = (self.dealer[0].value(), self.dealer[1].value());
        (a == 1 && b == 10) || (a == 10 && b == 1)
    }

    fn after_insurance(&mut self) {
        let rules = self.settings.rules;
        let up = self.dealer[0].value();
        let peeked = rules.peek && (up == 1 || up == 10);
        if peeked && self.dealer_has_bj() {
            if rules.surrender == Surrender::Early && !self.hands[0].is_natural() {
                // early surrender comes before the peek: give the player that one decision
                self.pending_peek = true;
                self.phase = Phase::Player;
                return;
            }
            self.play_bots();
            self.finish();
            return;
        }
        self.play_bots();
        if self.hands[0].is_natural() {
            self.hands[0].done = true;
            self.finish();
            return;
        }
        self.phase = Phase::Player;
    }

    /// Other players act before you, by basic strategy.
    fn play_bots(&mut self) {
        let up = self.dealer[0].value() as usize;
        let rules = self.settings.rules;
        let peeked_bj = rules.peek && self.dealer_has_bj();
        if peeked_bj {
            return;
        }
        for b in 0..self.bots.len() {
            let mut i = 0;
            while i < self.bots[b].len() {
                loop {
                    if self.bots[b][i].cards.len() == 1 {
                        let c = self.draw_to(Seat::Bot(b as u8), i as u8, true);
                        self.bots[b][i].cards.push(c);
                    }
                    let h = &self.bots[b][i];
                    if h.done || h.is_natural() || h.total().0 >= 21 {
                        self.bots[b][i].done = true;
                        break;
                    }
                    let vals = h.values();
                    let view = HandView { cards: &vals, from_split: h.from_split, ace_split: h.ace_split };
                    let a = self.advisor.advise(&view, up, self.bots[b].len() as u32, 0.0, false).action;
                    match a {
                        HIT => {
                            let c = self.draw_to(Seat::Bot(b as u8), i as u8, true);
                            self.bots[b][i].cards.push(c);
                        }
                        DOUBLE => {
                            let c = self.draw_to(Seat::Bot(b as u8), i as u8, true);
                            let h = &mut self.bots[b][i];
                            h.cards.push(c);
                            h.bet *= 2.0;
                            h.doubled = true;
                            h.done = true;
                        }
                        SURRENDER => {
                            let h = &mut self.bots[b][i];
                            h.surrendered = true;
                            h.done = true;
                        }
                        SPLIT => {
                            let h = self.bots[b][i].clone();
                            let mut a1 = Hand::new(1.0);
                            a1.from_split = true;
                            a1.ace_split = h.cards[0].rank == 1;
                            let mut a2 = a1.clone();
                            a1.cards.push(h.cards[0]);
                            a2.cards.push(h.cards[1]);
                            self.bots[b][i] = a1;
                            self.bots[b].insert(i + 1, a2);
                            self.events.push(Event::Split { seat: Seat::Bot(b as u8), hand: i as u8 });
                        }
                        _ => {
                            self.bots[b][i].done = true;
                        }
                    }
                }
                i += 1;
            }
        }
    }

    pub fn act(&mut self, action: u8) -> bool {
        let Some(lg) = self.legal() else { return false };
        if !lg.allows(action) {
            return false;
        }
        self.acted = true;
        let h = self.hands[self.active].clone();
        let up = self.dealer[0].value();
        let (best, index, vals, cat, index_spot) = self.correct_play(&h);
        let cost = if action == best || vals[best as usize].is_nan() || vals[action as usize].is_nan() {
            0.0
        } else {
            (vals[best as usize] - vals[action as usize]).max(0.0)
        };
        self.record(Decision {
            spot: Self::describe(&h, up),
            chosen: ca::ACTION_NAMES[action as usize].into(),
            best: ca::ACTION_NAMES[best as usize].into(),
            correct: action == best,
            ev_cost: cost,
            index,
            count: self.count(),
            category: cat,
            index_spot,
        });

        if self.pending_peek {
            // early-surrender game with a dealer blackjack waiting: the first decision decides
            self.pending_peek = false;
            if action == SURRENDER {
                self.hands[0].surrendered = true;
                self.hands[0].done = true;
            }
            self.finish();
            return true;
        }

        let i = self.active;
        match action {
            HIT => {
                let c = self.draw_to(Seat::Player, i as u8, true);
                self.hands[i].cards.push(c);
                if self.hands[i].total().0 >= 21 {
                    self.hands[i].done = true;
                }
            }
            STAND => self.hands[i].done = true,
            DOUBLE => {
                self.stats.wagered += self.hands[i].bet;
                self.stats.doubles += 1;
                self.hands[i].bet *= 2.0;
                self.hands[i].doubled = true;
                let c = self.draw_to(Seat::Player, i as u8, true);
                self.hands[i].cards.push(c);
                self.hands[i].done = true;
            }
            SURRENDER => {
                self.hands[i].surrendered = true;
                self.hands[i].done = true;
            }
            _ => {
                let (a, b) = (h.cards[0], h.cards[1]);
                let aces = a.rank == 1;
                let mk = |c: Card, bet: f64| Hand { cards: vec![c], from_split: true, ace_split: aces, ..Hand::new(bet) };
                self.stats.wagered += self.main_bet;
                self.stats.splits += 1;
                self.hands.splice(i..=i, [mk(a, self.main_bet), mk(b, self.main_bet)]);
                self.events.push(Event::Split { seat: Seat::Player, hand: i as u8 });
            }
        }
        self.advance();
        true
    }

    /// Move to the next live hand, dealing second cards to split hands as they come up.
    fn advance(&mut self) {
        while self.active < self.hands.len() {
            let i = self.active;
            if self.hands[i].cards.len() == 1 {
                let c = self.draw_to(Seat::Player, i as u8, true);
                self.hands[i].cards.push(c);
            }
            if !self.hands[i].done {
                let lg = self.legal().unwrap_or_default();
                if lg.forced || self.hands[i].total().0 >= 21 {
                    self.hands[i].done = true;
                }
            }
            if !self.hands[i].done {
                return;
            }
            self.active += 1;
        }
        self.finish();
    }

    fn finish(&mut self) {
        let rules = self.settings.rules;
        self.phase = Phase::Settled;
        if !self.hole_revealed {
            self.hole_revealed = true;
            let hole = self.dealer[1];
            self.see(hole);
            let (running_count, count) = (self.running_count(), self.count());
            self.events.push(Event::HoleRevealed { card: hole, running_count, count });
        }
        let dealer_bj = self.dealer_has_bj();
        let live = self.hands.iter().chain(self.bots.iter().flatten()).any(|h| !h.surrendered && !h.busted() && !h.is_natural());
        if !dealer_bj && live {
            loop {
                let vals: Vec<u8> = self.dealer.iter().map(|c| c.value()).collect();
                let (_, _, eff, soft) = hand_info(&vals);
                if eff > 17 || (eff == 17 && !(soft && rules.h17)) {
                    break;
                }
                let c = self.draw_to(Seat::Dealer, 0, true);
                self.dealer.push(c);
            }
        }
        let dvals: Vec<u8> = self.dealer.iter().map(|c| c.value()).collect();
        let d = hand_info(&dvals).2;

        let mut net = 0.0;
        let main_bet = self.main_bet;
        for (hi, h) in self.hands.iter_mut().enumerate() {
            let t = h.total().0;
            let (o, n) = if h.surrendered {
                (Outcome::Surrender, -h.bet / 2.0)
            } else if h.is_natural() {
                if dealer_bj { (Outcome::Push, 0.0) } else { (Outcome::Blackjack, h.bet * rules.bj_pays) }
            } else if t > 21 {
                (Outcome::Bust, -h.bet)
            } else if dealer_bj {
                // no-hole-card "original bets only" refunds doubles and splits
                (Outcome::Lose, if !rules.peek && rules.obo { if hi == 0 { -main_bet } else { 0.0 } } else { -h.bet })
            } else if d > 21 || t > d {
                (Outcome::Win, h.bet)
            } else if t == d {
                (Outcome::Push, 0.0)
            } else {
                (Outcome::Lose, -h.bet)
            };
            h.outcome = Some(o);
            h.net = n;
            net += n;
            let s = &mut self.stats;
            s.hands += 1;
            match o {
                Outcome::Blackjack => {
                    s.blackjacks += 1;
                    s.wins += 1;
                }
                Outcome::Win => s.wins += 1,
                Outcome::Push => s.pushes += 1,
                Outcome::Bust => {
                    s.busts += 1;
                    s.losses += 1;
                }
                Outcome::Surrender => s.surrenders += 1,
                Outcome::Lose => s.losses += 1,
            }
        }
        for h in self.bots.iter_mut().flatten() {
            let t = h.total().0;
            h.outcome = Some(if h.surrendered {
                Outcome::Surrender
            } else if h.is_natural() {
                if dealer_bj { Outcome::Push } else { Outcome::Blackjack }
            } else if t > 21 {
                Outcome::Bust
            } else if dealer_bj || (d <= 21 && t < d) {
                Outcome::Lose
            } else if t == d {
                Outcome::Push
            } else {
                Outcome::Win
            });
        }
        if let Some(ins) = self.insurance {
            net += if dealer_bj { ins * 2.0 } else { -ins };
        }
        self.settle_side(2);

        self.round_net += net;
        self.stats.net += net;
        self.stats.rounds += 1;
        self.bankroll += self.round_net;

        let (bet, side_stake, count0, side_ev, side_var) = self.round_start;
        let edge = match &self.edge_model {
            Some(m) => m.edge_at(count0),
            None => self.base_edge + 0.005 * if self.settings.count.balanced { count0 } else { 0.0 },
        };
        let prev_cost = self.rounds.last().map(|r| r.error_cost).unwrap_or(0.0);
        let mistakes = self.stats.ev_lost - prev_cost;
        self.rounds.push(RoundRecord {
            n: self.stats.rounds,
            t: self.elapsed_ms(),
            bet,
            side_stake,
            count: count0,
            net: self.round_net,
            bankroll: self.bankroll,
            error_cost: self.stats.ev_lost,
            ev: bet * edge + side_ev - mistakes,
            variance: (1.15 * bet).powi(2) + side_var,
        });
        if self.rounds.len() > MAX_ROUNDS {
            self.rounds.remove(0);
        }
        self.events.push(Event::Settled { net: self.round_net });
    }

    fn settle_side(&mut self, i: usize) {
        let stake = self.side_stakes[i];
        if stake <= 0.0 {
            return;
        }
        let bet = sidebets::ALL[i];
        let p = [self.hands[0].cards[0], self.hands[0].cards[1]];
        let (outcome, net) = sidebets::settle(bet, &self.settings.pays[i], p, self.dealer[0], self.dealer_has_bj());
        let label = outcome.map(|o| bet.outcomes()[o].label.to_string()).unwrap_or_else(|| "No win".into());
        self.side_results.push(SideResult { bet, stake, outcome, label, net, ev_before: self.side_evs_before.get(i).copied().unwrap_or(0.0) });
        self.round_net += net * stake;
        self.stats.side_net += net * stake;
        self.stats.side_staked += stake;
        if outcome.is_some() {
            self.stats.side_wins += 1;
        }
    }

    fn record(&mut self, d: Decision) {
        self.stats.decisions += 1;
        if d.correct {
            self.stats.correct += 1;
        }
        self.stats.ev_lost += d.ev_cost * self.main_bet;
        let tally = |t: &mut Tally| {
            t.n += 1;
            if d.correct {
                t.ok += 1;
            }
        };
        match d.category {
            Category::Hard => tally(&mut self.stats.hard),
            Category::Soft => tally(&mut self.stats.soft),
            Category::Pair => tally(&mut self.stats.pair),
            Category::Insurance => tally(&mut self.stats.insurance),
        }
        if d.index_spot {
            tally(&mut self.stats.index);
        }
        self.last_decision = Some(d.clone());
        self.log.insert(0, d);
        self.log.truncate(MAX_LOG);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::count::system;
    use crate::strategy::{published_hilo, HILO_INSURANCE_INDEX};

    pub fn settings(rules: Rules) -> GameSettings {
        GameSettings {
            rules,
            count: system("hilo"),
            tc_mode: TrueCountMode::default(),
            plays: published_hilo(),
            insurance_index: Some(HILO_INSURANCE_INDEX),
            use_indices: true,
            pays: sidebets::ALL.iter().map(|b| b.default_pays()).collect(),
            min_bet: 5.0,
            max_bet: 500.0,
            bots: 2,
        }
    }

    fn autoplay(g: &mut Game, rounds: usize) {
        for _ in 0..rounds {
            assert!(g.deal());
            if g.phase == Phase::Insurance {
                let take = g.advisor.insurance_correct(g.count());
                g.take_insurance(take);
            }
            let mut guard = 0;
            while g.phase == Phase::Player {
                let (a, _) = g.advice().unwrap();
                assert!(g.act(a), "illegal advice {a}");
                guard += 1;
                assert!(guard < 50);
            }
            assert_eq!(g.phase, Phase::Settled);
        }
    }

    #[test]
    fn perfect_play_is_always_graded_correct_and_the_count_matches_the_cards() {
        for rules in [
            Rules { surrender: Surrender::Late, ..Rules::default() },
            Rules { decks: 2, h17: true, resplit_aces: true, ..Rules::default() },
            Rules { peek: false, obo: false, double_on: crate::rules::DoubleOn::NineToEleven, ..Rules::default() },
            Rules { surrender: Surrender::Early, ..Rules::default() },
        ] {
            let mut g = Game::new(settings(rules), Rng::new(42));
            g.set_side_stake(0, 5.0);
            g.set_side_stake(1, 5.0);
            g.set_side_stake(2, 5.0);
            let mut seen_tags = 0i32;
            let mut last_shuffles = 0;
            for _ in 0..3000 {
                g.take_events();
                autoplay(&mut g, 1);
                for e in g.take_events() {
                    match e {
                        Event::Shuffle { .. } => {
                            seen_tags = 0;
                            last_shuffles += 1;
                        }
                        Event::Card { card, face_up: true, .. } | Event::HoleRevealed { card, .. } => seen_tags += g.settings.count.tag2(card.card_type()),
                        _ => {}
                    }
                }
                // the running count equals the tags of every card shown since the shuffle
                assert_eq!(g.rc2, seen_tags, "{}", rules.shorthand());
                assert_eq!(g.in_tray() + g.on_table(), g.shoe.dealt());
            }
            assert!(last_shuffles > 10);
            assert_eq!(g.stats.correct, g.stats.decisions, "{}", rules.shorthand());
            assert_eq!(g.stats.ev_lost, 0.0);
            assert!(g.stats.index.n > 0);
            assert!(g.rounds.len() >= 2000);
            let s = &g.stats;
            assert_eq!(s.wins + s.losses + s.pushes + s.surrenders, s.hands);
        }
    }

    #[test]
    fn a_mistake_is_priced() {
        let mut g = Game::new(settings(Rules::default()), Rng::new(7));
        for _ in 0..500 {
            g.deal();
            if g.phase == Phase::Insurance {
                g.take_insurance(false);
            }
            while g.phase == Phase::Player {
                let (best, _) = g.advice().unwrap();
                let lg = g.legal().unwrap();
                let wrong = if best == STAND && lg.hit { HIT } else { STAND };
                if lg.allows(wrong) && g.hands[g.active].total().0 >= 12 && g.hands[g.active].total().0 <= 16 {
                    g.act(wrong);
                    let d = g.last_decision.clone().unwrap();
                    assert!(!d.correct);
                    assert!(d.ev_cost >= 0.0 && d.ev_cost < 1.0, "{d:?}");
                    if d.ev_cost > 0.0 {
                        return;
                    }
                } else {
                    g.act(best);
                }
            }
        }
        panic!("no priced mistake");
    }

    #[test]
    fn snapshot_restores_the_shoe() {
        let mut g = Game::new(settings(Rules::default()), Rng::new(9));
        autoplay(&mut g, 20);
        let s = serde_json::to_string(&g.snapshot()).unwrap();
        let mut h = Game::new(settings(Rules::default()), Rng::new(10));
        h.restore(&serde_json::from_str(&s).unwrap());
        assert_eq!(h.shoe.dealt(), g.shoe.dealt());
        assert_eq!(h.rc2, g.rc2);
        assert_eq!(h.rounds.len(), 20);
        let mut other = Game::new(settings(Rules { decks: 2, ..Rules::default() }), Rng::new(11));
        other.restore(&serde_json::from_str(&s).unwrap());
        assert_eq!(other.shoe.dealt(), 0);
        assert_eq!(other.bankroll, g.bankroll);
    }

    #[test]
    fn unbalanced_counts_start_from_the_initial_count() {
        let mut s = settings(Rules::default());
        s.count = system("ko");
        s.plays = vec![];
        let g = Game::new(s, Rng::new(1));
        assert_eq!(g.running_count(), -20.0);
        assert_eq!(g.count(), -20.0);
    }
}
