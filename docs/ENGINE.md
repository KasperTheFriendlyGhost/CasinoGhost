# The CasinoGhost engine: methods and verification

CasinoGhost's numbers come from an engine written in Rust (`engine/`). The same code runs inside
the iPhone and iPad app (through UniFFI) and in the test suite. This page explains how each
number is produced, what it assumes, and how it is checked. Every check below is an automated
test that runs on every change (`cargo test --release` in `engine/`, and in CI).

## What the engine computes

| Area | Module | What it gives you |
|---|---|---|
| Exact analysis | `ca.rs`, `strategy.rs` | Basic strategy for any rules; house edge; the exact value of every action from any shoe composition |
| Simulation | `sim.rs` | Card-by-card play at a full table with any count, true-count convention and index plays; results tallied by count |
| Indices | `indices.rs` | Index plays generated for any rules, count system and rounding convention |
| Risk | `risk.rs` | Win rate, SD, risk of ruin (lifetime and trip), N0, DI, SCORE, the bankroll for a target risk, and an optimal bet ramp |
| Edge gauge | `edge.rs` | Edge at each count, the spread of the true edge at that count, and the exact edge of the remaining cards |
| Side bets | `sidebets.rs` | Exact odds for 21+3, Perfect Pairs and Lucky Ladies from any shoe; effects of removal; derived counts; side-count simulation |
| Table | `game.rs` | The interactive game: grading, mistakes priced from the unseen cards, sessions saved with the shoe in play |

## Rules covered

- **Shoe:** 1–8 decks.
- **Dealer:** hits or stands on soft 17.
- **Blackjack payout:** 3:2, 6:5, 7:5, 1:1 or 2:1.
- **Doubling:** on any two cards, 9–11 only, 10–11 only, or not at all; double after split on or off.
- **Splitting:** up to 2, 3 or 4 hands, with resplitting and hitting split aces as options.
- **Surrender:** late, early or none.
- **Hole card:** dealer peeks, or no hole card (lose all bets, or original bets only).
- **Shuffling:** penetration set as a fraction or in decks, or a continuous shuffler.
- **Table:** the number of other players, rounds per hour, and minimum and maximum bets.

Table rules can be typed as shorthand (`6D H17 DAS LS RSA 3:2 PEN:80%`) or in plain English.

## Counting systems

The engine supports these systems:

- **Balanced:** Hi-Lo, Hi-Opt I, Hi-Opt II, Omega II, Zen and Wong Halves.
- **Unbalanced** (used from a running count with an initial count): KO and Red 7, which counts suits for the red sevens.

Tags are held in half-points, so Wong Halves stays exact.

The true count follows the player's own conventions:

- **Rounding:** floor, truncate, round, or exact.
- **Deck estimation:** to the card, to the quarter deck, to the half deck, or to the whole deck.

The simulator and the index generator both use exactly the count the player would act on.

## Exact analysis

The analysis model is the one used by the original cutcard engine, ported to Rust:

- **Dealer:** the dealer's outcome distribution is exact, with card removal (memoised on the
  multiset of cards the dealer draws).
- **Player's later cards:** cards drawn after the first two come from the composition at the
  decision, without further depletion. This is exact for an infinite deck and a tiny error for
  two or more decks.
- **Splits:** resplits recurse to the hand limit.
- **Values:** in units of the original bet. Peek and no-hole-card games are both handled.

**Checks** (`tests/oracle.rs`, `strategy.rs`):

- **Against the original JavaScript engine,** on 18 rule sets: the house edge matches to 1e-9, and
  every strategy cell matches, including multi-card hit/stand. The JavaScript engine had already
  been checked against Wizard of Odds strategy pages and published house edges.
- **Against published figures:**

  | Quantity | Engine | Published |
  |---|---|---|
  | 6D S17 DAS house edge | 0.40% | ≈0.40% |
  | 8D S17 DAS house edge | 0.43% | ≈0.43% |
  | H17 penalty | +0.21% | ≈0.2% |
  | 6:5 penalty | +1.36% | ≈1.39% |
  | Late surrender | −0.07% | ≈−0.07% |
  | No DAS | +0.14% | ≈+0.14% |
  | No hole card | +0.11% | ≈+0.11% |

- **Basic strategy:** the generated 6-deck S17 DAS chart matches the published chart cell for
  cell, as do the H17 and late-surrender differences.

## Simulation

The simulator plays every round at a real table:

1. Other players and the counter are dealt one card each, then the upcard, a second card each,
   and the hole card.
2. Other players play basic strategy.
3. The counter plays basic strategy plus index plays at the count they see when deciding.
4. Insurance is taken at the insurance index.
5. The dealer plays out, and the shoe is shuffled at the cut card.

The counter flat-bets one unit every round. Each round's result is recorded by the count at the
time of the bet. With the frequency, mean and second moment of the result at each count, any bet
ramp, wonging rule or bankroll can then be evaluated exactly, without simulating again.

The simulator runs on every core, each with its own random stream (xoshiro256++), so a given seed
always gives the same result. It manages about 13 million rounds per second on a 4-core desktop.

**Checks** (`sim.rs`):

- **Exact agreement:** with a continuous shuffler, every round comes from a full shoe, so the
  simulated result must equal the exact house edge. Over 20 million rounds for each of four rule
  sets (S17; H17 with late surrender; 6:5 double deck; no hole card), it agrees within sampling
  error. The SD per round is 1.15, as published.
- **Edge by count:** with Hi-Lo and the Illustrious 18 plus Fab 4, the edge rises about 0.5% per
  true count from below zero, which is the standard result.

## Index generation

Published index tables cover one count (usually Hi-Lo), one set of rules and one rounding
convention. CasinoGhost generates indices for whatever you play:

1. **Collect real shoes.** Simulate shoes and keep the compositions met at the start of rounds,
   with a fixed-size random sample (a reservoir) at every count, plus how often each count
   occurs.
2. **Value every action exactly.** For every strategy cell (hard 5–17, soft 13–20 and all pairs
   against every upcard) and every sampled shoe, remove the upcard and the two player cards and
   compute each action's exact value.
3. **Bin by the decision-time count.** Each value is binned by the count the player sees at the
   decision, after the two cards and the upcard are visible. That is the count an index is
   compared with at the table.
4. **Find the crossings.** An index is where the best action changes. The crossing is
   interpolated between counts, then expressed in the player's rounding convention.
5. **Rank by value.** Each play is weighted by how often it arises and how much it gains, which
   gives its worth in units per 100 rounds.

Averaging exact values over real compositions removes almost all of the noise of playing hands
out. It also accounts for how compositions vary at a given count, which a single "average shoe"
calculation misses.

**Check** (`indices.rs`): Hi-Lo indices generated for 6D S17 DAS, with and without late surrender,
compared with the published Illustrious 18 and Fab 4:

| Play | Published | Generated |
|---|---|---|
| Insurance | +3 | +3 |
| 16 v 10 stand | 0 | +1 (crossing +0.68) |
| 15 v 10 stand | +4 | +4 |
| 10,10 v 5 split | +5 | +5 |
| 10,10 v 6 split | +4 | +4 |
| 10 v 10 double | +4 | +3 |
| 12 v 3 stand | +2 | +2 |
| 12 v 2 stand | +3 | +4 |
| 11 v A double | +1 | +1 |
| 9 v 2 double | +1 | +1 |
| 10 v A double | +4 | +4 |
| 9 v 7 double | +3 | +3 |
| 16 v 9 stand | +5 | +5 |
| 13 v 2 stand | −1 | −1 |
| 12 v 4 stand | 0 | 0 |
| 12 v 5 stand | −2 | −2 |
| 12 v 6 stand | −1 | −2 |
| 13 v 3 stand | −2 | −3 |
| 14 v 10 surrender | +3 | +3 |
| 15 v 10 surrender | 0 | 0 |
| 15 v 9 surrender | +2 | +2 |
| 15 v A surrender | +1 | +1 |

All 21 plays plus insurance are within one count of the published values, and 16 are exact.
Published indices are themselves rounded, risk-averse in places, and computed under slightly
different conventions, so differences of one are expected. The generated ranking by value also
matches the classic order, led by 16 v 10, 12 v 4 and 10,10 v 6.

## Risk

Results by count give the mean μ and variance σ² per round of any bet plan:

- **Risk of ruin:** exp(−2μB/σ²) for a bankroll B.
- **Trip risk of ruin:** the first-passage probability of Brownian motion with drift over the
  trip's rounds.
- **N0** = σ²/μ² rounds.
- **DI** = 1000·μ/σ, and **SCORE** = DI², which is the win per 100 rounds for a $10,000 bankroll
  bet at full Kelly.
- **Bankroll for a target risk r:** −ln(r)·σ²/(2μ).
- **Optimiser:** finds the ramp that maximises hourly win subject to a risk-of-ruin limit. Bets
  are proportional to edge divided by the second moment at each count (Kelly-proportional),
  clipped to the table limits and your spread, and never falling as the count rises.

**Checks** (`risk.rs`):

- SCORE = DI² and N0 = 10⁶/SCORE.
- The bankroll for 13.5% risk gives exactly 13.5% risk.
- Trip risk is below lifetime risk and converges to it.
- Wonging raises the edge on money bet.
- The optimiser meets its risk target and never lowers a bet as the count rises.

## The edge gauge

The old gauge was a rule of thumb: the house edge plus 0.5% per true count. The new one is built
from your actual game:

- **The needle** is your edge at your count, for your exact rules, penetration, number of
  players, count system, rounding convention and index plays. The game is simulated for 10
  million rounds (well under a second on a desktop, a little longer on a phone; then cached).
  The results by count are smoothed into one curve: a cubic fitted by weighted least squares,
  with each count weighted by its precision (1/SE²). Where the data runs out, the curve
  continues as a straight line rather than letting the polynomial run away. If noise at the
  thin ends would make a cubic dip as the count rises, a quadratic or a line is used instead.
- **The band** is the 10th to 90th percentile of the true edge of real shoes at that count. It
  comes from exact analysis of 48 sampled shoes per count, and shows how much the count can
  mislead. It is drawn around the curve and interpolated between counts, but not smoothed: it
  really is narrow near zero, where most shoes have barely been dealt.
- **The marker (optional)** is the exact edge of the cards actually left, calculated live.
- **Below the dial:**
  - your game's whole curve, with the band, how often each count comes up, the break-even
    count, and a marker that rides the curve as the count changes;
  - the break-even count, solved from the curve;
  - the edge off the top;
  - the range at your count, or a Kelly bet suggestion.

**Checks** (`edge.rs`):

- **Two methods agree.** Where both exist, the average exact edge of sampled shoes agrees with
  the simulated edge at every count from −3 to +4. Exact analysis and card-by-card simulation
  are independent, and they give the same curve.
- **The fit is faithful.** The fitted curve is within sampling error (3.5 SE) of the simulated
  edge at every count from −5 to +5.
- **The fitting routine is exact.** It recovers a known cubic exactly, the curve is continuous
  where it turns into a line, and the break-even count is a root of the curve.

For 6D S17 DAS with Hi-Lo, the Illustrious 18 and Fab 4, floored true counts, and the counter
alone at the table:

| True count | Simulated | Curve | True edge, 10th–90th percentile |
|---|---|---|---|
| −3 | −1.74% ± 0.15 | −1.75% | −2.18% to −1.42% |
| −1 | −0.76% ± 0.08 | −0.74% | −1.09% to −0.56% |
| 0 | −0.24% ± 0.07 | −0.23% | −0.45% to +0.12% |
| +1 | +0.35% ± 0.11 | +0.29% | −0.12% to +0.66% |
| +2 | +0.60% ± 0.13 | +0.82% | +0.24% to +1.34% |
| +3 | +1.47% ± 0.19 | +1.36% | +0.86% to +1.86% |
| +4 | +2.02% ± 0.23 | +1.90% | +1.02% to +2.71% |
| +5 | +3.02% ± 0.34 | +2.45% | +1.72% to +3.44% |

Break-even is at a floored true count of +0.44, and the slope is about 0.52% per true count.
Both are the textbook results for Hi-Lo.

## Side bets

The odds are closed-form over the 52 card types, so they are exact for any shoe.

**Checks** (`sidebets.rs`):

- Perfect Pairs 25/12/6 with 6 decks: a 6.11% house edge, as published.
- 21+3 Classic 9:1: 3.24%, as published.
- Single-deck 21+3 outcome counts equal a full enumeration of C(52,3) hands.
- Settlement over 400,000 dealt rounds agrees with the exact figures for every bet.

## Known approximations

- In the exact analysis, a player's later hit cards don't deplete the shoe. The simulator plays
  real cards, so this affects only basic strategy and index generation. The effect is negligible
  for two or more decks, and about 0.05% in single-deck games.
- Risk formulas treat rounds as independent, which is standard practice.
- Other players at the table play basic strategy with flat bets.
