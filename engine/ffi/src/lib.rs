//! Swift-facing API for the CasinoGhost engine, generated with UniFFI.
//!
//! Records here mirror the engine's types with FFI-friendly fields; long computations take a
//! `ProgressHandle` so the app can show progress and cancel. Swift calls blocking functions
//! from a background task.

use cg::ca::{self, Kind as CKind};
use cg::cards::Card as CCard;
use cg::count::{self, CountSystem, Rounding as CRounding, TrueCountMode};
use cg::edge::{self, EdgeModel};
use cg::game::{self, Game, GameSettings};
use cg::indices;
use cg::rng::Rng;
use cg::risk;
use cg::rules::{self, DoubleOn as CDoubleOn, Rules, Surrender as CSurrender, TableConditions};
use cg::sidebets::{self, SideBet as CSideBet};
use cg::sim::{self, Progress, SimConfig};
use cg::strategy::{self, IndexPlay, IndexSet as CIndexSet};
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};

uniffi::setup_scaffolding!();

// ----- Enums -----------------------------------------------------------------------------------

#[derive(uniffi::Enum, Clone, Copy, Debug, PartialEq, Eq)]
pub enum DoubleOn {
    Any,
    NineToEleven,
    TenToEleven,
    NoDoubling,
}

#[derive(uniffi::Enum, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Surrender {
    NoSurrender,
    Late,
    Early,
}

#[derive(uniffi::Enum, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Rounding {
    Floor,
    Truncate,
    Round,
    Exact,
}

#[derive(uniffi::Enum, Clone, Copy, Debug, PartialEq, Eq)]
pub enum CellKind {
    Hard,
    Soft,
    Pair,
}

/// Which published Hi-Lo plays to use.
#[derive(uniffi::Enum, Clone, Copy, Debug, PartialEq, Eq)]
pub enum PublishedIndices {
    NoIndices,
    InsuranceOnly,
    I18,
    I18Fab4,
    Full,
}

#[derive(uniffi::Enum, Clone, Copy, Debug, PartialEq, Eq)]
pub enum SideBetKind {
    PerfectPairs,
    TwentyOnePlusThree,
    LuckyLadies,
}

#[derive(uniffi::Enum, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Betting,
    Insurance,
    Player,
    Settled,
}

#[derive(uniffi::Enum, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Outcome {
    Blackjack,
    Win,
    Push,
    Lose,
    Bust,
    Surrender,
}

#[derive(uniffi::Enum, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Seat {
    Dealer,
    Player,
    Bot { index: u8 },
}

#[derive(uniffi::Enum, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Category {
    Hard,
    Soft,
    Pair,
    Insurance,
}

#[derive(uniffi::Enum, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Action {
    Stand,
    Hit,
    Double,
    Split,
    Surrender,
}

impl Action {
    fn code(self) -> u8 {
        match self {
            Action::Stand => ca::STAND,
            Action::Hit => ca::HIT,
            Action::Double => ca::DOUBLE,
            Action::Split => ca::SPLIT,
            Action::Surrender => ca::SURRENDER,
        }
    }
    fn from_code(a: u8) -> Action {
        match a {
            ca::HIT => Action::Hit,
            ca::DOUBLE => Action::Double,
            ca::SPLIT => Action::Split,
            ca::SURRENDER => Action::Surrender,
            _ => Action::Stand,
        }
    }
}

fn kind_in(k: CellKind) -> CKind {
    match k {
        CellKind::Hard => CKind::Hard,
        CellKind::Soft => CKind::Soft,
        CellKind::Pair => CKind::Pair,
    }
}
fn kind_out(k: CKind) -> CellKind {
    match k {
        CKind::Hard => CellKind::Hard,
        CKind::Soft => CellKind::Soft,
        CKind::Pair => CellKind::Pair,
    }
}
fn side_in(b: SideBetKind) -> CSideBet {
    match b {
        SideBetKind::PerfectPairs => CSideBet::PerfectPairs,
        SideBetKind::TwentyOnePlusThree => CSideBet::TwentyOnePlusThree,
        SideBetKind::LuckyLadies => CSideBet::LuckyLadies,
    }
}
fn side_out(b: CSideBet) -> SideBetKind {
    match b {
        CSideBet::PerfectPairs => SideBetKind::PerfectPairs,
        CSideBet::TwentyOnePlusThree => SideBetKind::TwentyOnePlusThree,
        CSideBet::LuckyLadies => SideBetKind::LuckyLadies,
    }
}

// ----- Rules and table -------------------------------------------------------------------------

#[derive(uniffi::Record, Clone, Debug, PartialEq)]
pub struct GameRules {
    pub decks: u32,
    pub h17: bool,
    pub peek: bool,
    pub obo: bool,
    pub bj_pays: f64,
    pub das: bool,
    pub double_on: DoubleOn,
    pub max_hands: u32,
    pub resplit_aces: bool,
    pub hit_split_aces: bool,
    pub surrender: Surrender,
    pub penetration: f64,
    pub csm: bool,
}

impl From<&GameRules> for Rules {
    fn from(r: &GameRules) -> Rules {
        Rules {
            decks: r.decks,
            h17: r.h17,
            peek: r.peek,
            obo: r.obo,
            bj_pays: r.bj_pays,
            das: r.das,
            double_on: match r.double_on {
                DoubleOn::Any => CDoubleOn::Any,
                DoubleOn::NineToEleven => CDoubleOn::NineToEleven,
                DoubleOn::TenToEleven => CDoubleOn::TenToEleven,
                DoubleOn::NoDoubling => CDoubleOn::None,
            },
            max_hands: r.max_hands,
            resplit_aces: r.resplit_aces,
            hit_split_aces: r.hit_split_aces,
            surrender: match r.surrender {
                Surrender::NoSurrender => CSurrender::None,
                Surrender::Late => CSurrender::Late,
                Surrender::Early => CSurrender::Early,
            },
            penetration: r.penetration,
            csm: r.csm,
        }
        .sanitized()
    }
}

impl From<&Rules> for GameRules {
    fn from(r: &Rules) -> GameRules {
        GameRules {
            decks: r.decks,
            h17: r.h17,
            peek: r.peek,
            obo: r.obo,
            bj_pays: r.bj_pays,
            das: r.das,
            double_on: match r.double_on {
                CDoubleOn::Any => DoubleOn::Any,
                CDoubleOn::NineToEleven => DoubleOn::NineToEleven,
                CDoubleOn::TenToEleven => DoubleOn::TenToEleven,
                CDoubleOn::None => DoubleOn::NoDoubling,
            },
            max_hands: r.max_hands,
            resplit_aces: r.resplit_aces,
            hit_split_aces: r.hit_split_aces,
            surrender: match r.surrender {
                CSurrender::None => Surrender::NoSurrender,
                CSurrender::Late => Surrender::Late,
                CSurrender::Early => Surrender::Early,
            },
            penetration: r.penetration,
            csm: r.csm,
        }
    }
}

#[derive(uniffi::Record, Clone, Debug, PartialEq)]
pub struct TableSetup {
    pub other_players: u32,
    pub rounds_per_hour: f64,
    pub min_bet: f64,
    pub max_bet: f64,
}

impl From<&TableSetup> for TableConditions {
    fn from(t: &TableSetup) -> Self {
        TableConditions { other_players: t.other_players, rounds_per_hour: t.rounds_per_hour, min_bet: t.min_bet, max_bet: t.max_bet }
    }
}
impl From<&TableConditions> for TableSetup {
    fn from(t: &TableConditions) -> Self {
        TableSetup { other_players: t.other_players, rounds_per_hour: t.rounds_per_hour, min_bet: t.min_bet, max_bet: t.max_bet }
    }
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct GamePreset {
    pub id: String,
    pub name: String,
    pub verdict: String,
    pub blurb: String,
    pub rules: GameRules,
    pub table: TableSetup,
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct ParsedRules {
    pub rules: GameRules,
    pub table: TableSetup,
    pub understood: Vec<String>,
    pub ignored: Vec<String>,
}

#[uniffi::export]
pub fn default_rules() -> GameRules {
    (&Rules::default()).into()
}

#[uniffi::export]
pub fn default_table() -> TableSetup {
    (&TableConditions::default()).into()
}

#[uniffi::export]
pub fn game_presets() -> Vec<GamePreset> {
    rules::presets()
        .into_iter()
        .map(|p| GamePreset {
            id: p.id.into(),
            name: p.name.into(),
            verdict: p.verdict.into(),
            blurb: p.blurb.into(),
            rules: (&p.rules).into(),
            table: (&p.table).into(),
        })
        .collect()
}

#[uniffi::export]
pub fn parse_rules(text: String, rules: GameRules, table: TableSetup) -> ParsedRules {
    let mut r: Rules = (&rules).into();
    let mut t: TableConditions = (&table).into();
    let p = rules::parse_rules(&text, &mut r, &mut t);
    ParsedRules { rules: (&r).into(), table: (&t).into(), understood: p.understood, ignored: p.ignored }
}

#[uniffi::export]
pub fn rules_shorthand(rules: GameRules) -> String {
    Rules::from(&rules).shorthand()
}

#[uniffi::export]
pub fn rules_description(rules: GameRules) -> String {
    Rules::from(&rules).describe()
}

// ----- Counting systems ------------------------------------------------------------------------

#[derive(uniffi::Record, Clone, Debug, PartialEq)]
pub struct CountingSystem {
    pub id: String,
    pub name: String,
    /// Tags in points for A, 2, 3 … 9, 10.
    pub tags: Vec<f64>,
    /// Extra points for a red seven (Red 7).
    pub red_seven: f64,
    pub balanced: bool,
    pub irc_per_deck: i32,
    pub irc_const: i32,
    pub note: String,
    pub level: f64,
    pub betting_correlation: f64,
}

impl From<&CountSystem> for CountingSystem {
    fn from(s: &CountSystem) -> Self {
        CountingSystem {
            id: s.id.clone(),
            name: s.name.clone(),
            tags: (1..=10).map(|v| s.tags2[v] as f64 / 2.0).collect(),
            red_seven: s.red_seven2 as f64 / 2.0,
            balanced: s.balanced,
            irc_per_deck: s.irc_per_deck,
            irc_const: s.irc_const,
            note: s.note.clone(),
            level: s.level(),
            betting_correlation: s.betting_correlation(),
        }
    }
}

impl From<&CountingSystem> for CountSystem {
    fn from(s: &CountingSystem) -> Self {
        let mut tags2 = [0i32; 11];
        for (i, t) in s.tags.iter().take(10).enumerate() {
            tags2[i + 1] = (t * 2.0).round() as i32;
        }
        CountSystem {
            id: s.id.clone(),
            name: s.name.clone(),
            tags2,
            red_seven2: (s.red_seven * 2.0).round() as i32,
            balanced: s.balanced,
            irc_per_deck: s.irc_per_deck,
            irc_const: s.irc_const,
            note: s.note.clone(),
        }
    }
}

#[derive(uniffi::Record, Clone, Copy, Debug, PartialEq)]
pub struct TrueCountRule {
    pub rounding: Rounding,
    /// Deck-estimation step: 0 exact, 0.5 half decks, 1 whole decks.
    pub deck_resolution: f64,
}

impl From<&TrueCountRule> for TrueCountMode {
    fn from(m: &TrueCountRule) -> Self {
        TrueCountMode {
            rounding: match m.rounding {
                Rounding::Floor => CRounding::Floor,
                Rounding::Truncate => CRounding::Truncate,
                Rounding::Round => CRounding::Round,
                Rounding::Exact => CRounding::Exact,
            },
            deck_resolution: m.deck_resolution,
        }
    }
}

#[uniffi::export]
pub fn counting_systems() -> Vec<CountingSystem> {
    count::systems().iter().map(Into::into).collect()
}

#[uniffi::export]
pub fn default_true_count_rule() -> TrueCountRule {
    TrueCountRule { rounding: Rounding::Floor, deck_resolution: 0.5 }
}

// ----- Strategy ----------------------------------------------------------------------------------

#[derive(uniffi::Record, Clone, Debug, PartialEq)]
pub struct IndexEntry {
    pub kind: CellKind,
    pub key: u32,
    pub up: u32,
    pub index: f64,
    pub above: Action,
    pub below: Action,
    pub base_below: bool,
    pub set: String,
    pub label: String,
    pub h17: Option<bool>,
    pub no_surrender_only: bool,
}

impl From<&IndexPlay> for IndexEntry {
    fn from(p: &IndexPlay) -> Self {
        IndexEntry {
            kind: kind_out(p.kind),
            key: p.key as u32,
            up: p.up as u32,
            index: p.index,
            above: Action::from_code(p.above),
            below: Action::from_code(p.below),
            base_below: p.base_below,
            set: p.set.clone(),
            label: p.label(),
            h17: p.h17,
            no_surrender_only: p.no_surrender_only,
        }
    }
}
impl From<&IndexEntry> for IndexPlay {
    fn from(e: &IndexEntry) -> Self {
        IndexPlay {
            kind: kind_in(e.kind),
            key: e.key as usize,
            up: e.up as usize,
            index: e.index,
            above: e.above.code(),
            below: e.below.code(),
            base_below: e.base_below,
            set: e.set.clone(),
            h17: e.h17,
            no_surrender_only: e.no_surrender_only,
        }
    }
}

fn index_set_in(s: PublishedIndices) -> CIndexSet {
    match s {
        PublishedIndices::NoIndices => CIndexSet::None,
        PublishedIndices::InsuranceOnly => CIndexSet::InsuranceOnly,
        PublishedIndices::I18 => CIndexSet::I18,
        PublishedIndices::I18Fab4 => CIndexSet::I18Fab4,
        PublishedIndices::Full => CIndexSet::Full,
    }
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct ChartRow {
    pub label: String,
    pub key: u32,
    /// Codes for dealer 2, 3 … 10, A: S, H, D, Ds, P, R, Rs, Rp.
    pub codes: Vec<String>,
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct StrategyChart {
    pub hard: Vec<ChartRow>,
    pub soft: Vec<ChartRow>,
    pub pairs: Vec<ChartRow>,
    /// House edge with this strategy (positive = house advantage).
    pub house_edge: f64,
}

const UPS: [usize; 10] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1];

#[uniffi::export]
pub fn strategy_chart(rules: GameRules) -> StrategyChart {
    let r: Rules = (&rules).into();
    let s = strategy::basic_strategy(&r);
    let row = |t: &strategy::Table, key: usize, label: String| ChartRow {
        label,
        key: key as u32,
        codes: UPS.iter().map(|&u| strategy::cell_code(t, key, u).to_string()).collect(),
    };
    StrategyChart {
        hard: (5..=17).rev().map(|k| row(&s.initial.hard, k, k.to_string())).collect(),
        soft: (13..=20).rev().map(|k| row(&s.initial.soft, k, format!("A,{}", k - 11))).collect(),
        pairs: (1..=10)
            .rev()
            .map(|k| {
                let c = if k == 1 { "A".to_string() } else { k.to_string() };
                row(&s.initial.pair, k, format!("{c},{c}"))
            })
            .collect(),
        house_edge: strategy::house_edge(&r, &s),
    }
}

#[uniffi::export]
pub fn house_edge(rules: GameRules) -> f64 {
    let r: Rules = (&rules).into();
    strategy::house_edge(&r, &strategy::basic_strategy(&r))
}

/// The published Hi-Lo plays that apply under these rules for a chosen set.
#[uniffi::export]
pub fn published_indices(rules: GameRules, set: PublishedIndices) -> Vec<IndexEntry> {
    let r: Rules = (&rules).into();
    let s = strategy::basic_strategy(&r);
    strategy::applicable(&strategy::published_hilo(), &r, &s, index_set_in(set)).iter().map(Into::into).collect()
}

#[uniffi::export]
pub fn hilo_insurance_index() -> f64 {
    strategy::HILO_INSURANCE_INDEX
}

// ----- Progress ----------------------------------------------------------------------------------

#[derive(uniffi::Object, Default)]
pub struct ProgressHandle {
    inner: Arc<Progress>,
}

#[uniffi::export]
impl ProgressHandle {
    #[uniffi::constructor]
    pub fn new() -> Arc<Self> {
        Arc::new(ProgressHandle::default())
    }
    /// 0 to 1.
    pub fn fraction(&self) -> f64 {
        self.inner.fraction()
    }
    pub fn cancel(&self) {
        self.inner.cancel.store(true, Ordering::Relaxed);
    }
    pub fn is_cancelled(&self) -> bool {
        self.inner.cancel.load(Ordering::Relaxed)
    }
}

impl ProgressHandle {
    fn start(&self, total: u64) -> &Progress {
        self.inner.done.store(0, Ordering::Relaxed);
        self.inner.total.store(total.max(1), Ordering::Relaxed);
        &self.inner
    }
}

// ----- Simulation --------------------------------------------------------------------------------

#[derive(uniffi::Record, Clone, Debug)]
pub struct SimulationSetup {
    pub rules: GameRules,
    pub table: TableSetup,
    pub count: CountingSystem,
    pub true_count: TrueCountRule,
    pub plays: Vec<IndexEntry>,
    pub insurance_index: Option<f64>,
    pub rounds: u64,
    pub seed: u64,
}

impl From<&SimulationSetup> for SimConfig {
    fn from(s: &SimulationSetup) -> Self {
        SimConfig {
            rules: (&s.rules).into(),
            table: (&s.table).into(),
            count: (&s.count).into(),
            tc_mode: (&s.true_count).into(),
            plays: s.plays.iter().map(Into::into).collect(),
            insurance_index: s.insurance_index,
            rounds: s.rounds,
            seed: s.seed,
        }
    }
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct CountResult {
    pub count: i32,
    pub rounds: u64,
    pub freq: f64,
    pub ev: f64,
    pub se: f64,
    pub sd: f64,
    pub insured: u64,
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct SimulationReport {
    pub rows: Vec<CountResult>,
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
    /// Flat-bet EV per round, its SD and standard error.
    pub ev: f64,
    pub sd: f64,
    pub se: f64,
    pub elapsed_secs: f64,
    pub cancelled: bool,
    /// Engine state for risk calculations (JSON), passed back to `evaluate_plan`.
    pub data: String,
}

fn report(r: &sim::SimResult) -> SimulationReport {
    let total = r.totals.rounds;
    SimulationReport {
        rows: r
            .rows
            .iter()
            .filter(|x| x.rounds > 0)
            .map(|x| CountResult { count: x.count, rounds: x.rounds, freq: x.freq(total), ev: x.ev(), se: x.se(), sd: x.var().sqrt(), insured: x.insured })
            .collect(),
        rounds: total,
        shoes: r.totals.shoes,
        hands: r.totals.hands,
        wins: r.totals.wins,
        losses: r.totals.losses,
        pushes: r.totals.pushes,
        blackjacks: r.totals.blackjacks,
        doubles: r.totals.doubles,
        splits: r.totals.splits,
        surrenders: r.totals.surrenders,
        insurances: r.totals.insurances,
        deviations: r.totals.deviations,
        ev: r.ev(),
        sd: r.sd(),
        se: r.se(),
        elapsed_secs: r.elapsed_secs,
        cancelled: r.cancelled,
        data: serde_json::to_string(r).unwrap_or_default(),
    }
}

/// Run a simulation on all cores (blocking).
#[uniffi::export]
pub fn simulate(setup: SimulationSetup, progress: Arc<ProgressHandle>) -> SimulationReport {
    let cfg: SimConfig = (&setup).into();
    let p = progress.start(cfg.rounds);
    report(&sim::simulate(&cfg, p))
}

// ----- Risk --------------------------------------------------------------------------------------

#[derive(uniffi::Record, Clone, Debug, PartialEq)]
pub struct RampStep {
    pub count: f64,
    pub units: f64,
}

#[derive(uniffi::Record, Clone, Debug, PartialEq)]
pub struct BetPlan {
    pub unit: f64,
    pub steps: Vec<RampStep>,
    pub play_from: Option<f64>,
}

impl From<&BetPlan> for risk::BetPlan {
    fn from(p: &BetPlan) -> Self {
        risk::BetPlan { unit: p.unit, steps: p.steps.iter().map(|s| risk::RampStep { count: s.count, units: s.units }).collect(), play_from: p.play_from }
    }
}
impl From<&risk::BetPlan> for BetPlan {
    fn from(p: &risk::BetPlan) -> Self {
        BetPlan { unit: p.unit, steps: p.steps.iter().map(|s| RampStep { count: s.count, units: s.units }).collect(), play_from: p.play_from }
    }
}

#[derive(uniffi::Record, Clone, Debug, PartialEq)]
pub struct RiskSetup {
    pub bankroll: f64,
    pub rounds_per_hour: f64,
    pub trip_hours: f64,
}

#[derive(uniffi::Record, Clone, Debug, PartialEq)]
pub struct RiskReport {
    pub ev_round: f64,
    pub sd_round: f64,
    pub win_per_100: f64,
    pub sd_per_100: f64,
    pub win_per_hour: f64,
    pub sd_per_hour: f64,
    pub avg_bet: f64,
    pub play_fraction: f64,
    pub edge_on_action: f64,
    pub ror: f64,
    pub trip_ror: f64,
    pub p_ahead_trip: f64,
    pub n0_rounds: f64,
    pub n0_hours: f64,
    pub di: f64,
    pub score: f64,
    pub bankroll_13: f64,
    pub bankroll_5: f64,
    pub bankroll_1: f64,
    pub spread: f64,
}

impl From<&risk::RiskReport> for RiskReport {
    fn from(r: &risk::RiskReport) -> Self {
        RiskReport {
            ev_round: r.ev_round,
            sd_round: r.sd_round,
            win_per_100: r.win_per_100,
            sd_per_100: r.sd_per_100,
            win_per_hour: r.win_per_hour,
            sd_per_hour: r.sd_per_hour,
            avg_bet: r.avg_bet,
            play_fraction: r.play_fraction,
            edge_on_action: r.edge_on_action,
            ror: r.ror,
            trip_ror: r.trip_ror,
            p_ahead_trip: r.p_ahead_trip,
            n0_rounds: r.n0_rounds,
            n0_hours: r.n0_hours,
            di: r.di,
            score: r.score,
            bankroll_13: r.bankroll_13,
            bankroll_5: r.bankroll_5,
            bankroll_1: r.bankroll_1,
            spread: r.spread,
        }
    }
}

#[derive(uniffi::Record, Clone, Debug, PartialEq)]
pub struct OptimizeSetup {
    pub bankroll: f64,
    pub target_ror: f64,
    pub min_bet: f64,
    pub max_bet: f64,
    pub increment: f64,
    pub max_spread: f64,
    pub wong_out: bool,
    pub rounds_per_hour: f64,
}

#[derive(uniffi::Record, Clone, Debug, PartialEq)]
pub struct OptimizedPlan {
    pub plan: BetPlan,
    pub report: RiskReport,
    pub feasible: bool,
}

fn sim_from(data: &str) -> sim::SimResult {
    serde_json::from_str(data).unwrap_or_default()
}

#[uniffi::export]
pub fn spread_plan(max_units: f64, unit: f64) -> BetPlan {
    (&risk::BetPlan::spread(max_units, unit)).into()
}

#[uniffi::export]
pub fn evaluate_plan(report: SimulationReport, plan: BetPlan, setup: RiskSetup) -> RiskReport {
    let s = sim_from(&report.data);
    let r = risk::evaluate(&s, &(&plan).into(), &risk::RiskInput { bankroll: setup.bankroll, rounds_per_hour: setup.rounds_per_hour, trip_hours: setup.trip_hours });
    (&r).into()
}

#[uniffi::export]
pub fn optimize_plan(report: SimulationReport, setup: OptimizeSetup) -> OptimizedPlan {
    let s = sim_from(&report.data);
    let o = risk::optimize(
        &s,
        &risk::OptimizeInput {
            bankroll: setup.bankroll,
            target_ror: setup.target_ror,
            min_bet: setup.min_bet,
            max_bet: setup.max_bet,
            increment: setup.increment,
            max_spread: setup.max_spread,
            wong_out: setup.wong_out,
            rounds_per_hour: setup.rounds_per_hour,
        },
    );
    OptimizedPlan { plan: (&o.plan).into(), report: (&o.report).into(), feasible: o.feasible }
}

// ----- Indices -----------------------------------------------------------------------------------

#[derive(uniffi::Record, Clone, Debug)]
pub struct GeneratedIndexEntry {
    pub play: IndexEntry,
    pub crossing: f64,
    pub gain_per_100: f64,
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct IndexReport {
    pub indices: Vec<GeneratedIndexEntry>,
    pub insurance: Option<f64>,
    pub insurance_crossing: Option<f64>,
    pub samples: u64,
}

/// Generate indices for these rules and count (blocking; seconds to a minute).
#[uniffi::export]
pub fn generate_indices(setup: SimulationSetup, per_count: u32, progress: Arc<ProgressHandle>) -> IndexReport {
    let cfg: SimConfig = (&setup).into();
    let p = progress.start(cfg.rounds * 2);
    let r = indices::generate(&cfg, per_count as usize, 30, p);
    IndexReport {
        indices: r.indices.iter().map(|g| GeneratedIndexEntry { play: (&g.play).into(), crossing: g.crossing, gain_per_100: g.gain_per_100 }).collect(),
        insurance: r.insurance,
        insurance_crossing: r.insurance_crossing,
        samples: r.samples as u64,
    }
}

// ----- Edge model --------------------------------------------------------------------------------

#[derive(uniffi::Record, Clone, Debug, PartialEq)]
pub struct EdgeRow {
    pub count: i32,
    pub freq: f64,
    pub ev: f64,
    pub se: f64,
    pub sd: f64,
    pub exact_mean: Option<f64>,
    pub low: Option<f64>,
    pub high: Option<f64>,
}

#[derive(uniffi::Record, Clone, Debug, PartialEq)]
pub struct EdgeCurve {
    pub rows: Vec<EdgeRow>,
    pub intercept: f64,
    pub slope: f64,
    pub overall: f64,
    pub break_even: f64,
    /// The fitted curve: ev = c0 + c1·x + c2·x² + c3·x³ on [fit_lo, fit_hi], x = count − shift.
    pub coefficients: Vec<f64>,
    pub fit_lo: f64,
    pub fit_hi: f64,
    pub shift: f64,
}

impl From<&EdgeModel> for EdgeCurve {
    fn from(m: &EdgeModel) -> Self {
        EdgeCurve {
            rows: m
                .rows
                .iter()
                .map(|r| EdgeRow { count: r.count, freq: r.freq, ev: r.ev, se: r.se, sd: r.sd, exact_mean: r.exact_mean, low: r.low, high: r.high })
                .collect(),
            intercept: m.intercept,
            slope: m.slope,
            overall: m.overall,
            break_even: m.break_even(),
            coefficients: m.coefficients.clone(),
            fit_lo: m.fit_lo,
            fit_hi: m.fit_hi,
            shift: m.shift,
        }
    }
}
impl From<&EdgeCurve> for EdgeModel {
    fn from(c: &EdgeCurve) -> Self {
        EdgeModel {
            rows: c
                .rows
                .iter()
                .map(|r| edge::EdgeRow { count: r.count, freq: r.freq, ev: r.ev, se: r.se, sd: r.sd, exact_mean: r.exact_mean, low: r.low, high: r.high })
                .collect(),
            intercept: c.intercept,
            slope: c.slope,
            overall: c.overall,
            coefficients: c.coefficients.clone(),
            fit_lo: c.fit_lo,
            fit_hi: c.fit_hi,
            shift: c.shift,
        }
    }
}

/// The gauge's edge at a (possibly fractional) count, from the fitted curve.
#[uniffi::export]
pub fn curve_edge(curve: EdgeCurve, count: f64) -> f64 {
    EdgeModel::from(&curve).edge_at(count)
}

/// 10th and 90th percentiles of the true edge at a count, if the curve has them.
#[uniffi::export]
pub fn curve_band(curve: EdgeCurve, count: f64) -> Option<EdgeBand> {
    EdgeModel::from(&curve).band_at(count).map(|(low, high)| EdgeBand { low, high })
}

#[derive(uniffi::Record, Clone, Copy, Debug, PartialEq)]
pub struct EdgeBand {
    pub low: f64,
    pub high: f64,
}

/// Simulate the game and build the edge gauge's model, including the spread of the true edge
/// at each count (`spread_per_count` sampled shoes per count; 0 to skip). Blocking.
#[uniffi::export]
pub fn build_edge_curve(setup: SimulationSetup, spread_per_count: u32, progress: Arc<ProgressHandle>) -> EdgeCurve {
    let cfg: SimConfig = (&setup).into();
    let sample_rounds = (cfg.rounds / 10).max(100_000);
    let p = progress.start(cfg.rounds + if spread_per_count > 0 { sample_rounds } else { 0 });
    let result = sim::simulate(&cfg, p);
    let exact_counts = cfg.count.balanced && cfg.tc_mode.rounding == CRounding::Exact;
    let mut model = EdgeModel::from_sim(&result, (cfg.rounds / 2000).max(5000), exact_counts);
    if spread_per_count > 0 && !p.cancel.load(Ordering::Relaxed) {
        let rules = cfg.rules;
        let s = strategy::basic_strategy(&rules);
        let samples = sim::sample_compositions(&SimConfig { rounds: sample_rounds, ..cfg.clone() }, spread_per_count as usize, p);
        let plays = strategy::applicable(&cfg.plays, &rules, &s, CIndexSet::Full);
        edge::add_spread(&mut model, &rules, &s, &plays, cfg.insurance_index, &samples, spread_per_count as usize);
    }
    (&model).into()
}

// ----- Side bets ---------------------------------------------------------------------------------

#[derive(uniffi::Record, Clone, Debug)]
pub struct SideBetOutcome {
    pub key: String,
    pub label: String,
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct Paytable {
    pub name: String,
    pub pays: Vec<f64>,
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct SideBetInfo {
    pub bet: SideBetKind,
    pub name: String,
    pub short: String,
    pub blurb: String,
    pub outcomes: Vec<SideBetOutcome>,
    pub presets: Vec<Paytable>,
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct SideBetAnalysis {
    pub probs: Vec<f64>,
    pub p_lose: f64,
    pub ev: f64,
    pub sd: f64,
    /// Effect of removing one card of each value A..10 on the EV.
    pub effects: Vec<f64>,
    /// Derived tags A..10 and whether the bet is countable.
    pub tags: Vec<i32>,
    pub countable: bool,
    pub deck_sum: i32,
}

#[uniffi::export]
pub fn side_bets() -> Vec<SideBetInfo> {
    sidebets::ALL
        .iter()
        .map(|b| SideBetInfo {
            bet: side_out(*b),
            name: b.name().into(),
            short: b.short().into(),
            blurb: b.blurb().into(),
            outcomes: b.outcomes().into_iter().map(|o| SideBetOutcome { key: o.key.into(), label: o.label.into() }).collect(),
            presets: b.presets().into_iter().map(|p| Paytable { name: p.name.into(), pays: p.pays }).collect(),
        })
        .collect()
}

#[uniffi::export]
pub fn analyze_side_bet(bet: SideBetKind, decks: u32, pays: Vec<f64>, count_level: i32) -> SideBetAnalysis {
    let b = side_in(bet);
    let c = sidebets::fresh52(decks.clamp(1, 8));
    let e = sidebets::evaluate(b, &c, &pays);
    let eor = sidebets::effects_of_removal(b, &c, &pays);
    let dc = sidebets::derive_count(&eor, count_level.clamp(1, 3));
    SideBetAnalysis {
        probs: e.probs,
        p_lose: e.p_lose,
        ev: e.ev,
        sd: e.sd,
        effects: eor[1..].to_vec(),
        tags: dc.tags[1..].to_vec(),
        countable: dc.countable,
        deck_sum: dc.deck_sum,
    }
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct SideCountSetup {
    pub bet: SideBetKind,
    pub pays: Vec<f64>,
    pub decks: u32,
    pub penetration: f64,
    pub seats: u32,
    /// Tags A..10.
    pub tags: Vec<i32>,
    pub shoes: u64,
    pub seed: u64,
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct SideCountBin {
    pub tc: i32,
    pub rounds: u64,
    pub mean_ev: f64,
    pub p_positive: f64,
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct SideCountReport {
    pub rounds: u64,
    pub base_ev: f64,
    pub bins: Vec<SideCountBin>,
    pub threshold: Option<i32>,
    pub play_freq: f64,
    pub ev_when_playing: f64,
    pub gain_per_100: f64,
    pub perfect_gain_per_100: f64,
    pub perfect_play_freq: f64,
}

#[uniffi::export]
pub fn simulate_side_count(setup: SideCountSetup) -> SideCountReport {
    let mut tags = [0i32; 11];
    for (i, t) in setup.tags.iter().take(10).enumerate() {
        tags[i + 1] = *t;
    }
    let r = sidebets::simulate_side_count(&sidebets::SideCountConfig {
        bet: side_in(setup.bet),
        pays: setup.pays,
        decks: setup.decks.clamp(1, 8),
        penetration: setup.penetration.clamp(0.3, 0.95),
        seats: setup.seats.clamp(1, 7),
        tags,
        shoes: setup.shoes,
        seed: setup.seed,
    });
    SideCountReport {
        rounds: r.rounds,
        base_ev: r.base_ev,
        bins: r.bins.iter().map(|b| SideCountBin { tc: b.tc, rounds: b.rounds, mean_ev: b.mean_ev, p_positive: b.p_positive }).collect(),
        threshold: r.threshold,
        play_freq: r.play_freq,
        ev_when_playing: r.ev_when_playing,
        gain_per_100: r.gain_per_100,
        perfect_gain_per_100: r.perfect_gain_per_100,
        perfect_play_freq: r.perfect_play_freq,
    }
}

// ----- The table ---------------------------------------------------------------------------------

#[derive(uniffi::Record, Clone, Debug)]
pub struct TableConfig {
    pub rules: GameRules,
    pub count: CountingSystem,
    pub true_count: TrueCountRule,
    pub plays: Vec<IndexEntry>,
    pub insurance_index: Option<f64>,
    pub use_indices: bool,
    /// Paytables for Perfect Pairs, 21+3 and Lucky Ladies.
    pub pays: Vec<Vec<f64>>,
    pub min_bet: f64,
    pub max_bet: f64,
    pub bots: u32,
}

#[derive(uniffi::Record, Clone, Copy, Debug, PartialEq, Eq)]
pub struct PlayingCard {
    /// 1 = ace … 13 = king.
    pub rank: u8,
    /// 0 spades, 1 hearts, 2 diamonds, 3 clubs.
    pub suit: u8,
}

impl From<CCard> for PlayingCard {
    fn from(c: CCard) -> Self {
        PlayingCard { rank: c.rank, suit: c.suit }
    }
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct TableHand {
    pub cards: Vec<PlayingCard>,
    pub bet: f64,
    pub doubled: bool,
    pub from_split: bool,
    pub ace_split: bool,
    pub done: bool,
    pub surrendered: bool,
    pub outcome: Option<Outcome>,
    pub net: f64,
    pub total: u32,
    pub soft: bool,
}

fn outcome_out(o: game::Outcome) -> Outcome {
    match o {
        game::Outcome::Blackjack => Outcome::Blackjack,
        game::Outcome::Win => Outcome::Win,
        game::Outcome::Push => Outcome::Push,
        game::Outcome::Lose => Outcome::Lose,
        game::Outcome::Bust => Outcome::Bust,
        game::Outcome::Surrender => Outcome::Surrender,
    }
}

impl From<&game::Hand> for TableHand {
    fn from(h: &game::Hand) -> Self {
        let (total, soft) = h.total();
        TableHand {
            cards: h.cards.iter().map(|c| (*c).into()).collect(),
            bet: h.bet,
            doubled: h.doubled,
            from_split: h.from_split,
            ace_split: h.ace_split,
            done: h.done,
            surrendered: h.surrendered,
            outcome: h.outcome.map(outcome_out),
            net: h.net,
            total,
            soft,
        }
    }
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct DecisionRecord {
    pub spot: String,
    pub chosen: String,
    pub best: String,
    pub correct: bool,
    pub ev_cost: f64,
    pub index: Option<String>,
    pub count: f64,
    pub category: Category,
    pub index_spot: bool,
}

impl From<&game::Decision> for DecisionRecord {
    fn from(d: &game::Decision) -> Self {
        DecisionRecord {
            spot: d.spot.clone(),
            chosen: d.chosen.clone(),
            best: d.best.clone(),
            correct: d.correct,
            ev_cost: d.ev_cost,
            index: d.index.clone(),
            count: d.count,
            category: match d.category {
                game::Category::Hard => Category::Hard,
                game::Category::Soft => Category::Soft,
                game::Category::Pair => Category::Pair,
                game::Category::Insurance => Category::Insurance,
            },
            index_spot: d.index_spot,
        }
    }
}

#[derive(uniffi::Record, Clone, Debug, Default)]
pub struct Tally {
    pub n: u32,
    pub ok: u32,
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct SessionStats {
    pub rounds: u32,
    pub decisions: u32,
    pub correct: u32,
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

fn tally(t: &game::Tally) -> Tally {
    Tally { n: t.n, ok: t.ok }
}

impl From<&game::Stats> for SessionStats {
    fn from(s: &game::Stats) -> Self {
        SessionStats {
            rounds: s.rounds,
            decisions: s.decisions,
            correct: s.correct,
            ev_lost: s.ev_lost,
            net: s.net,
            side_net: s.side_net,
            side_staked: s.side_staked,
            wagered: s.wagered,
            hands: s.hands,
            wins: s.wins,
            losses: s.losses,
            pushes: s.pushes,
            blackjacks: s.blackjacks,
            busts: s.busts,
            surrenders: s.surrenders,
            doubles: s.doubles,
            splits: s.splits,
            insurances: s.insurances,
            side_wins: s.side_wins,
            hard: tally(&s.hard),
            soft: tally(&s.soft),
            pair: tally(&s.pair),
            insurance: tally(&s.insurance),
            index: tally(&s.index),
        }
    }
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct RoundSummary {
    pub n: u32,
    pub t: f64,
    pub bet: f64,
    pub side_stake: f64,
    pub count: f64,
    pub net: f64,
    pub bankroll: f64,
    pub error_cost: f64,
    pub ev: f64,
    pub variance: f64,
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct SideBetSettlement {
    pub bet: SideBetKind,
    pub stake: f64,
    pub won: bool,
    pub label: String,
    pub net: f64,
    pub ev_before: f64,
}

#[derive(uniffi::Record, Clone, Copy, Debug, Default)]
pub struct LegalActions {
    pub hit: bool,
    pub stand: bool,
    pub double: bool,
    pub split: bool,
    pub surrender: bool,
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct Advice {
    pub action: Action,
    pub index: Option<String>,
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct TableState {
    pub phase: Phase,
    pub dealer: Vec<PlayingCard>,
    pub hole_revealed: bool,
    pub dealer_total: u32,
    pub hands: Vec<TableHand>,
    pub active: u32,
    pub bots: Vec<Vec<TableHand>>,
    pub bankroll: f64,
    pub main_bet: f64,
    pub side_stakes: Vec<f64>,
    pub side_results: Vec<SideBetSettlement>,
    pub insurance: Option<f64>,
    pub running_count: f64,
    pub count: f64,
    pub true_count_exact: f64,
    pub decks_left: f64,
    pub decks_estimate: f64,
    pub cards_left: u32,
    pub shoe_size: u32,
    pub cut: u32,
    pub dealt: u32,
    pub in_tray: u32,
    pub on_table: u32,
    pub just_shuffled: bool,
    pub last_decision: Option<DecisionRecord>,
    pub stats: SessionStats,
    pub round_net: f64,
    pub acted: bool,
    pub estimated_edge: f64,
    pub base_edge: f64,
    pub side_bet_evs: Vec<f64>,
    pub legal: Option<LegalActions>,
    pub paused: bool,
    pub elapsed_ms: f64,
}

#[derive(uniffi::Enum, Clone, Debug)]
pub enum TableEvent {
    Shuffle { running_count: f64, count: f64 },
    Card { seat: Seat, hand: u8, card: PlayingCard, face_up: bool, running_count: f64, count: f64, cards_left: u32 },
    Split { seat: Seat, hand: u8 },
    HoleRevealed { card: PlayingCard, running_count: f64, count: f64 },
    Settled { net: f64 },
}

fn seat_out(s: game::Seat) -> Seat {
    match s {
        game::Seat::Dealer => Seat::Dealer,
        game::Seat::Player => Seat::Player,
        game::Seat::Bot(i) => Seat::Bot { index: i },
    }
}

fn settings_from(c: &TableConfig) -> GameSettings {
    let mut pays: Vec<Vec<f64>> = c.pays.clone();
    for (i, b) in sidebets::ALL.iter().enumerate() {
        if pays.len() <= i {
            pays.push(b.default_pays());
        }
    }
    GameSettings {
        rules: (&c.rules).into(),
        count: (&c.count).into(),
        tc_mode: (&c.true_count).into(),
        plays: c.plays.iter().map(Into::into).collect(),
        insurance_index: c.insurance_index,
        use_indices: c.use_indices,
        pays,
        min_bet: c.min_bet,
        max_bet: c.max_bet,
        bots: c.bots.min(6),
    }
}

/// The interactive table. All methods are thread-safe.
#[derive(uniffi::Object)]
pub struct TableGame {
    game: Mutex<Game>,
}

#[uniffi::export]
impl TableGame {
    /// A new table; `session` is a JSON snapshot from `snapshot()` to continue a session.
    /// `seed` makes the shuffle reproducible (for demos and tests).
    #[uniffi::constructor]
    pub fn new(config: TableConfig, session: Option<String>, bankroll: f64, seed: Option<u64>) -> Arc<Self> {
        let rng = match seed {
            Some(s) => Rng::new(s),
            None => Rng::from_entropy(),
        };
        let mut g = Game::new(settings_from(&config), rng);
        g.bankroll = bankroll;
        if let Some(s) = session.and_then(|s| serde_json::from_str::<game::Snapshot>(&s).ok()) {
            g.restore(&s);
        }
        Arc::new(TableGame { game: Mutex::new(g) })
    }

    pub fn state(&self) -> TableState {
        let g = self.game.lock().unwrap();
        let dvals: Vec<u8> = g.dealer.iter().enumerate().filter(|(i, _)| *i == 0 || g.hole_revealed).map(|(_, c)| c.value()).collect();
        TableState {
            phase: match g.phase {
                game::Phase::Betting => Phase::Betting,
                game::Phase::Insurance => Phase::Insurance,
                game::Phase::Player => Phase::Player,
                game::Phase::Settled => Phase::Settled,
            },
            dealer: g.dealer.iter().map(|c| (*c).into()).collect(),
            hole_revealed: g.hole_revealed,
            dealer_total: strategy::hand_info(&dvals).2,
            hands: g.hands.iter().map(Into::into).collect(),
            active: g.active as u32,
            bots: g.bots.iter().map(|b| b.iter().map(Into::into).collect()).collect(),
            bankroll: g.bankroll,
            main_bet: g.main_bet,
            side_stakes: g.side_stakes.clone(),
            side_results: g
                .side_results
                .iter()
                .map(|r| SideBetSettlement { bet: side_out(r.bet), stake: r.stake, won: r.outcome.is_some(), label: r.label.clone(), net: r.net, ev_before: r.ev_before })
                .collect(),
            insurance: g.insurance,
            running_count: g.running_count(),
            count: g.count(),
            true_count_exact: g.true_count_exact(),
            decks_left: g.shoe.decks_left(),
            decks_estimate: g.decks_estimate(),
            cards_left: g.shoe.cards_left() as u32,
            shoe_size: g.shoe.size() as u32,
            cut: g.shoe.cut() as u32,
            dealt: g.shoe.dealt() as u32,
            in_tray: g.in_tray() as u32,
            on_table: g.on_table() as u32,
            just_shuffled: g.just_shuffled,
            last_decision: g.last_decision.as_ref().map(Into::into),
            stats: (&g.stats).into(),
            round_net: g.round_net,
            acted: g.acted,
            estimated_edge: g.estimated_edge(),
            base_edge: g.base_edge,
            side_bet_evs: g.side_bet_evs(),
            legal: g.legal().map(|l| LegalActions { hit: l.hit, stand: l.stand, double: l.double, split: l.split, surrender: l.surrender }),
            paused: g.paused(),
            elapsed_ms: g.elapsed_ms(),
        }
    }

    pub fn deal(&self) -> bool {
        self.game.lock().unwrap().deal()
    }
    pub fn act(&self, action: Action) -> bool {
        self.game.lock().unwrap().act(action.code())
    }
    pub fn take_insurance(&self, take: bool) {
        self.game.lock().unwrap().take_insurance(take)
    }
    pub fn set_bet(&self, amount: f64) {
        self.game.lock().unwrap().set_bet(amount)
    }
    pub fn set_side_stake(&self, bet: SideBetKind, amount: f64) {
        let i = sidebets::ALL.iter().position(|b| *b == side_in(bet)).unwrap_or(0);
        self.game.lock().unwrap().set_side_stake(i, amount)
    }
    pub fn new_shoe(&self) {
        self.game.lock().unwrap().new_shoe()
    }
    pub fn take_events(&self) -> Vec<TableEvent> {
        self.game
            .lock()
            .unwrap()
            .take_events()
            .into_iter()
            .map(|e| match e {
                game::Event::Shuffle { running_count, count } => TableEvent::Shuffle { running_count, count },
                game::Event::Card { seat, hand, card, face_up, running_count, count, cards_left } => {
                    TableEvent::Card { seat: seat_out(seat), hand, card: card.into(), face_up, running_count, count, cards_left }
                }
                game::Event::Split { seat, hand } => TableEvent::Split { seat: seat_out(seat), hand },
                game::Event::HoleRevealed { card, running_count, count } => TableEvent::HoleRevealed { card: card.into(), running_count, count },
                game::Event::Settled { net } => TableEvent::Settled { net },
            })
            .collect()
    }
    pub fn advice(&self) -> Option<Advice> {
        self.game.lock().unwrap().advice().map(|(a, index)| Advice { action: Action::from_code(a), index })
    }
    pub fn log(&self) -> Vec<DecisionRecord> {
        self.game.lock().unwrap().log.iter().map(Into::into).collect()
    }
    pub fn rounds(&self) -> Vec<RoundSummary> {
        self.game
            .lock()
            .unwrap()
            .rounds
            .iter()
            .map(|r| RoundSummary { n: r.n, t: r.t, bet: r.bet, side_stake: r.side_stake, count: r.count, net: r.net, bankroll: r.bankroll, error_cost: r.error_cost, ev: r.ev, variance: r.variance })
            .collect()
    }
    /// JSON snapshot of the session (bankroll, statistics, history and the shoe in play).
    pub fn snapshot(&self) -> String {
        serde_json::to_string(&self.game.lock().unwrap().snapshot()).unwrap_or_default()
    }
    pub fn reset_session(&self, bankroll: f64) {
        self.game.lock().unwrap().reset_session(bankroll)
    }
    pub fn pause(&self) {
        self.game.lock().unwrap().pause()
    }
    pub fn resume(&self) {
        self.game.lock().unwrap().resume()
    }
    /// Exact edge of the next round from the actual undealt cards (milliseconds).
    pub fn exact_edge(&self) -> f64 {
        // copy what's needed so the table isn't locked during the calculation
        let (rules, comp, strategy, plays, ins, count) = {
            let g = self.game.lock().unwrap();
            let plays = if g.settings.use_indices { g.advisor.plays.clone() } else { vec![] };
            (g.settings.rules, g.shoe.comp(), g.advisor.strategy.clone(), plays, g.advisor.insurance_index, g.count())
        };
        edge::exact_edge(&rules, &comp, &strategy, &plays, ins, count)
    }
    pub fn set_edge_curve(&self, curve: EdgeCurve) {
        self.game.lock().unwrap().edge_model = Some((&curve).into());
    }
}

#[uniffi::export]
pub fn engine_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
