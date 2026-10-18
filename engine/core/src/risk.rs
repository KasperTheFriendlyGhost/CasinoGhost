//! Bet ramps, win rate, variance and risk, computed exactly from a simulation's
//! results by count. Rounds are treated as independent (standard practice).

use crate::sim::SimResult;
use serde::{Deserialize, Serialize};

/// Bet `units` at counts >= `count` (the highest matching step applies).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct RampStep {
    pub count: f64,
    pub units: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BetPlan {
    /// Dollar value of one unit (the table minimum, usually).
    pub unit: f64,
    /// Ascending by count. Below the first step the first step's bet applies.
    pub steps: Vec<RampStep>,
    /// Sit out (wong out) below this count. None = play every round.
    pub play_from: Option<f64>,
}

impl BetPlan {
    pub fn units_at(&self, count: f64) -> f64 {
        if self.play_from.is_some_and(|p| count < p - 1e-9) {
            return 0.0;
        }
        let mut u = self.steps.first().map(|s| s.units).unwrap_or(1.0);
        for s in &self.steps {
            if count >= s.count - 1e-9 {
                u = s.units;
            }
        }
        u
    }

    /// A classic ramp: 1 unit up to count 1, then rising to `max_units` by count 5.
    pub fn spread(max_units: f64, unit: f64) -> BetPlan {
        let shape: &[(f64, f64)] = match max_units as u32 {
            0..=2 => &[(1., 1.), (2., 2.)],
            3..=4 => &[(1., 1.), (2., 2.), (3., 3.), (4., 4.)],
            5..=8 => &[(1., 1.), (2., 2.), (3., 4.), (4., 6.), (5., 8.)],
            9..=12 => &[(1., 1.), (2., 2.), (3., 4.), (4., 8.), (5., 10.), (6., 12.)],
            13..=16 => &[(1., 1.), (2., 2.), (3., 4.), (4., 8.), (5., 12.), (6., 16.)],
            _ => &[(1., 1.), (2., 2.), (3., 5.), (4., 10.), (5., 15.), (6., 20.)],
        };
        let scale = max_units / shape.last().unwrap().1;
        let mut steps: Vec<RampStep> = shape
            .iter()
            .map(|&(c, u)| RampStep { count: c, units: (u * scale).max(1.0) })
            .collect();
        steps.insert(0, RampStep { count: -100.0, units: 1.0 });
        BetPlan { unit, steps, play_from: None }
    }

    pub fn flat(unit: f64) -> BetPlan {
        BetPlan { unit, steps: vec![RampStep { count: -100.0, units: 1.0 }], play_from: None }
    }

    pub fn max_units(&self) -> f64 {
        self.steps.iter().map(|s| s.units).fold(0.0, f64::max)
    }
    pub fn min_units(&self) -> f64 {
        self.steps.iter().map(|s| s.units).filter(|u| *u > 0.0).fold(f64::INFINITY, f64::min)
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct RiskInput {
    /// Dollars.
    pub bankroll: f64,
    /// Rounds the dealer deals per hour (observed, whether or not you bet).
    pub rounds_per_hour: f64,
    /// Length of a trip or session, for trip risk of ruin.
    pub trip_hours: f64,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct RiskReport {
    /// Per round dealt, in dollars.
    pub ev_round: f64,
    pub sd_round: f64,
    pub win_per_100: f64,
    pub sd_per_100: f64,
    pub win_per_hour: f64,
    pub sd_per_hour: f64,
    /// Average initial bet on rounds played, dollars.
    pub avg_bet: f64,
    /// Share of rounds with a bet.
    pub play_fraction: f64,
    /// Win divided by money initially bet.
    pub edge_on_action: f64,
    /// Chance of ever losing the bankroll.
    pub ror: f64,
    /// Chance of losing the bankroll during one trip.
    pub trip_ror: f64,
    /// Chance of being ahead at the end of the trip.
    pub p_ahead_trip: f64,
    /// Rounds (and hours) for the expected win to equal one standard deviation.
    pub n0_rounds: f64,
    pub n0_hours: f64,
    /// Desirability index: 1000 x win / SD per round.
    pub di: f64,
    /// Win per 100 rounds for a $10,000 bankroll bet optimally at 13.5% risk (= DI^2).
    pub score: f64,
    /// Bankroll needed for 13.5%, 5% and 1% risk of ruin with this plan.
    pub bankroll_13: f64,
    pub bankroll_5: f64,
    pub bankroll_1: f64,
    /// Largest bet / smallest bet.
    pub spread: f64,
}

/// Standard normal CDF (erfc approximation, |error| < 1.2e-7).
pub fn norm_cdf(x: f64) -> f64 {
    let z = x.abs() / std::f64::consts::SQRT_2;
    let t = 1.0 / (1.0 + 0.5 * z);
    let erfc = t
        * (-z * z - 1.26551223
            + t * (1.00002368
                + t * (0.37409196
                    + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))))
            .exp();
    if x >= 0.0 { 1.0 - 0.5 * erfc } else { 0.5 * erfc }
}

/// Probability of ever losing `bankroll` with mean `mu` and variance `var` per round.
pub fn ruin(mu: f64, var: f64, bankroll: f64) -> f64 {
    if mu <= 0.0 {
        return 1.0;
    }
    if var <= 0.0 {
        return 0.0;
    }
    (-2.0 * mu * bankroll / var).exp().min(1.0)
}

/// Probability of losing `bankroll` within `n` rounds (Brownian motion with drift).
pub fn trip_ruin(mu: f64, var: f64, bankroll: f64, n: f64) -> f64 {
    let s = (var * n).sqrt();
    if s <= 0.0 {
        return 0.0;
    }
    let a = norm_cdf((-bankroll - mu * n) / s);
    let c = if mu == 0.0 { 1.0 } else { (-2.0 * mu * bankroll / var).exp() * norm_cdf((-bankroll + mu * n) / s) };
    (a + c).clamp(0.0, 1.0)
}

/// Mean, second moment and bet statistics of a plan, per round dealt, in units.
fn moments(sim: &SimResult, units: impl Fn(f64) -> f64) -> (f64, f64, f64, f64) {
    let total = sim.totals.rounds.max(1) as f64;
    let (mut mu, mut m2, mut iba, mut play) = (0.0, 0.0, 0.0, 0.0);
    for r in &sim.rows {
        if r.rounds == 0 {
            continue;
        }
        let b = units(r.count as f64);
        if b <= 0.0 {
            continue;
        }
        let f = r.rounds as f64 / total;
        mu += f * b * r.ev();
        m2 += f * b * b * r.m2();
        iba += f * b;
        play += f;
    }
    (mu, m2, iba, play)
}

pub fn evaluate(sim: &SimResult, plan: &BetPlan, input: &RiskInput) -> RiskReport {
    let (mu_u, m2_u, iba_u, play) = moments(sim, |c| plan.units_at(c));
    let u = plan.unit;
    let mu = mu_u * u;
    let var = ((m2_u - mu_u * mu_u) * u * u).max(1e-12);
    let sd = var.sqrt();
    let rph = input.rounds_per_hour.max(1.0);
    let n_trip = rph * input.trip_hours.max(0.0);
    let n0 = if mu > 0.0 { var / (mu * mu) } else { f64::INFINITY };
    let di = 1000.0 * mu / sd;
    let need = |r: f64| if mu > 0.0 { -r.ln() * var / (2.0 * mu) } else { f64::INFINITY };
    RiskReport {
        ev_round: mu,
        sd_round: sd,
        win_per_100: 100.0 * mu,
        sd_per_100: 10.0 * sd,
        win_per_hour: rph * mu,
        sd_per_hour: rph.sqrt() * sd,
        avg_bet: if play > 0.0 { iba_u / play * u } else { 0.0 },
        play_fraction: play,
        edge_on_action: if iba_u > 0.0 { mu_u / iba_u } else { 0.0 },
        ror: ruin(mu, var, input.bankroll),
        trip_ror: if n_trip > 0.0 { trip_ruin(mu, var, input.bankroll, n_trip) } else { 0.0 },
        p_ahead_trip: if n_trip > 0.0 { norm_cdf(mu * n_trip / (var * n_trip).sqrt()) } else { 0.5 },
        n0_rounds: n0,
        n0_hours: n0 / rph,
        di,
        score: if mu > 0.0 { di * di } else { 0.0 },
        bankroll_13: need((-2.0f64).exp()),
        bankroll_5: need(0.05),
        bankroll_1: need(0.01),
        spread: plan.max_units() / plan.min_units().max(1e-9),
    }
}

/// Constraints for an optimised plan, in dollars.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct OptimizeInput {
    pub bankroll: f64,
    pub target_ror: f64,
    pub min_bet: f64,
    pub max_bet: f64,
    /// Bets are rounded to this (e.g. 5 for red chips). 0 = no rounding.
    pub increment: f64,
    /// Largest bet / smallest bet allowed (e.g. 12 for a 1–12 spread).
    pub max_spread: f64,
    /// Sit out negative counts (back-counting).
    pub wong_out: bool,
    pub rounds_per_hour: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct OptimizedPlan {
    pub plan: BetPlan,
    pub report: RiskReport,
    /// False if no plan meets the risk target (the safest plan found is returned).
    pub feasible: bool,
}

/// The plan that maximises hourly win subject to risk of ruin <= target. Bets are proportional
/// to edge / second moment at each count (Kelly-proportional), clipped to the table and spread,
/// non-decreasing with the count.
pub fn optimize(sim: &SimResult, opt: &OptimizeInput) -> OptimizedPlan {
    let total = sim.totals.rounds.max(1);
    // rows with enough data to trust
    let rows: Vec<(f64, f64)> = sim
        .rows
        .iter()
        .filter(|r| r.rounds as f64 >= (total as f64 * 2e-4).max(2000.0))
        .map(|r| (r.count as f64, r.ev() / r.m2().max(1e-9)))
        .collect();
    let round_to = |v: f64| if opt.increment > 0.0 { (v / opt.increment).round() * opt.increment } else { v };
    let input = RiskInput { bankroll: opt.bankroll, rounds_per_hour: opt.rounds_per_hour, trip_hours: 0.0 };
    let mut best: Option<OptimizedPlan> = None;
    let mut safest: Option<OptimizedPlan> = None;
    let mut min_bet = opt.min_bet;
    let mut mins = vec![];
    for m in [1.0, 1.5, 2.0, 3.0, 4.0, 6.0, 8.0] {
        let v = round_to(opt.min_bet * m).max(opt.min_bet);
        if v <= opt.max_bet && !mins.contains(&v) {
            mins.push(v);
        }
    }
    for &m in &mins {
        min_bet = m;
        let top = opt.max_bet.min(m * opt.max_spread.max(1.0));
        for k in 0..110 {
            let scale = m * 0.5 * 1.1f64.powi(k);
            let mut steps: Vec<RampStep> = vec![];
            let mut last = 0.0f64;
            let mut play_from = None;
            for &(c, kappa) in &rows {
                let mut b = if kappa <= 0.0 {
                    if opt.wong_out { 0.0 } else { m }
                } else {
                    round_to(scale * kappa * 100.0).clamp(m, top)
                };
                if b > 0.0 && b < last {
                    b = last;
                }
                if b == 0.0 && c >= 0.0 && last > 0.0 {
                    b = m;
                }
                if b == 0.0 {
                    play_from = Some(c + 1.0);
                    continue;
                }
                if steps.last().map(|s: &RampStep| s.units) != Some(b / m) {
                    steps.push(RampStep { count: c, units: b / m });
                }
                last = b;
            }
            if steps.is_empty() {
                continue;
            }
            steps[0].count = -100.0;
            let plan = BetPlan { unit: m, steps, play_from };
            let report = evaluate(sim, &plan, &input);
            let cand = OptimizedPlan { plan, report, feasible: true };
            if safest.as_ref().is_none_or(|s| cand.report.ror < s.report.ror) {
                safest = Some(OptimizedPlan { feasible: false, ..cand.clone() });
            }
            if cand.report.ev_round > 0.0
                && cand.report.ror <= opt.target_ror
                && best.as_ref().is_none_or(|b| cand.report.win_per_hour > b.report.win_per_hour)
            {
                best = Some(cand);
            }
        }
    }
    let _ = min_bet;
    best.or(safest).unwrap_or(OptimizedPlan {
        plan: BetPlan::flat(opt.min_bet),
        report: evaluate(sim, &BetPlan::flat(opt.min_bet), &input),
        feasible: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::CountRow;

    fn toy_sim() -> SimResult {
        // a linear game: EV -0.5% + 0.5% per count, variance 1.3
        let mut rows = vec![];
        let mut total = 0;
        for c in -10..=10 {
            let f = (-(c as f64).powi(2) / 8.0).exp();
            let n = (f * 1_000_000.0) as u64;
            let ev = -0.005 + 0.005 * c as f64;
            rows.push(CountRow { count: c, rounds: n, won: ev * n as f64, won_sq: (1.3 + ev * ev) * n as f64, insured: 0 });
            total += n;
        }
        SimResult { rows, totals: crate::sim::SimTotals { rounds: total, ..Default::default() }, ..Default::default() }
    }

    #[test]
    fn normal_cdf() {
        assert!((norm_cdf(0.0) - 0.5).abs() < 1e-7);
        assert!((norm_cdf(1.96) - 0.975).abs() < 1e-4);
        assert!((norm_cdf(-1.0) - 0.158_655).abs() < 1e-5);
    }

    #[test]
    fn flat_betting_loses_and_ramp_wins() {
        let s = toy_sim();
        let input = RiskInput { bankroll: 10_000.0, rounds_per_hour: 100.0, trip_hours: 10.0 };
        let flat = evaluate(&s, &BetPlan::flat(10.0), &input);
        assert!(flat.ev_round < 0.0 && flat.ror == 1.0);
        let ramp = evaluate(&s, &BetPlan::spread(12.0, 10.0), &input);
        assert!(ramp.ev_round > 0.0, "ramp ev {}", ramp.ev_round);
        assert!(ramp.ror > 0.0 && ramp.ror < 1.0);
        assert!((ramp.score - ramp.di * ramp.di).abs() < 1e-9);
        assert!((ramp.n0_rounds - 1e6 / ramp.score).abs() / ramp.n0_rounds < 1e-9);
        // bankroll for 13.5% risk gives exactly 13.5% risk
        let at = evaluate(&s, &BetPlan::spread(12.0, 10.0), &RiskInput { bankroll: ramp.bankroll_13, ..input });
        assert!((at.ror - (-2.0f64).exp()).abs() < 1e-9);
        // wonging out of negative counts raises the win per round played
        let mut w = BetPlan::spread(12.0, 10.0);
        w.play_from = Some(0.0);
        let won = evaluate(&s, &w, &input);
        assert!(won.edge_on_action > ramp.edge_on_action && won.play_fraction < 1.0);
    }

    #[test]
    fn trip_ruin_is_below_lifetime_ruin() {
        let (mu, var, b) = (0.5, 1500.0, 2000.0);
        let life = ruin(mu, var, b);
        let trip = trip_ruin(mu, var, b, 2000.0);
        assert!(trip < life && trip > 0.0);
        assert!((trip_ruin(mu, var, b, 1e9) - life).abs() < 1e-3);
    }

    #[test]
    fn optimizer_meets_the_risk_target() {
        let s = toy_sim();
        // $20,000 can't reach 5% risk here (min bets at negative counts drag too hard)...
        let tight = OptimizeInput {
            bankroll: 20_000.0,
            target_ror: 0.05,
            min_bet: 10.0,
            max_bet: 500.0,
            increment: 5.0,
            max_spread: 16.0,
            wong_out: false,
            rounds_per_hour: 100.0,
        };
        assert!(!optimize(&s, &tight).feasible);
        // ...but sitting out negative counts can
        let w = optimize(&s, &OptimizeInput { wong_out: true, ..tight.clone() });
        assert!(w.feasible && w.report.ror <= 0.05 + 1e-12 && w.plan.play_from.is_some());
        let o = optimize(&s, &OptimizeInput {
            bankroll: 60_000.0,
            target_ror: 0.05,
            min_bet: 10.0,
            max_bet: 500.0,
            increment: 5.0,
            max_spread: 16.0,
            wong_out: false,
            rounds_per_hour: 100.0,
        });
        assert!(o.feasible);
        assert!(o.report.ror <= 0.05 + 1e-12, "ror {}", o.report.ror);
        assert!(o.report.win_per_hour > 0.0);
        assert!(o.report.spread <= 16.0 + 1e-9);
        // bets never fall as the count rises
        let units: Vec<f64> = (-5..=10).map(|c| o.plan.units_at(c as f64)).collect();
        assert!(units.windows(2).all(|w| w[1] >= w[0] - 1e-12), "{units:?}");
    }
}
