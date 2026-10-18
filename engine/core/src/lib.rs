//! CasinoGhost engine.
//!
//! * `cards`, `rng`, `rules`, `count`: the building blocks.
//! * `ca`: combinatorial analysis (exact dealer probabilities, action values, basic strategy,
//!   house edge and the exact edge of any shoe composition).
//! * `sim`: card-by-card simulation of a counter at a real table.
//! * `indices`: count-based strategy changes generated for any rules and count.
//! * `risk`: win rate, variance, risk of ruin, SCORE and optimal bet ramps.
//! * `sidebets`: exact side-bet analysis.
//! * `game`: the interactive table, with grading.

pub mod ca;
pub mod cards;
pub mod count;
pub mod edge;
pub mod indices;
pub mod rng;
pub mod risk;
pub mod rules;
pub mod sim;
pub mod strategy;
