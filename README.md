# CasinoGhost

A modern blackjack trainer and advantage-play lab: basic strategy, Hi-Lo card counting with
index plays, and exact, countable side bets (21+3, Perfect Pairs, Lucky Ladies).

## What's in it

| Screen | What it does |
|---|---|
| **Table** | Animated six-deck table. Every decision is graded against the strategy generated for your rules plus Hi-Lo index plays, with the dollar cost of each mistake. Live Hi-Lo count, a practice mode that hides the count and quizzes you, and live side-bet meters that show the exact edge of each side bet for the cards left in the shoe. |
| **Side Bet Lab** | Exact house edge for any paytable and deck count, the effect of removing each card, a best-fit balanced count derived automatically for the bet, and a 20,000-shoe simulation showing the edge at every true count, when to bet, and what it's worth against perfect card tracking. |
| **Strategy** | Basic-strategy chart solved for the current rules, the house edge with perfect play, and the index plays in use. |
| **Rules** | Presets, every rule as a control, and a plain-English rules box ("6 decks, dealer hits soft 17, late surrender"). |

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # engine tests (side-bet maths, simulator, game engine)
npm run build        # production build in dist/
npm run build:single # one self-contained HTML file in dist-single/
```

## How it's built

- `src/engine/cards.ts` — 52-type shoe with suits, seedable RNG.
- `src/engine/sidebets.ts` — closed-form exact EV for each side bet from any shoe composition;
  settlement; effects of removal; balanced integer count derivation.
- `src/engine/sidecountSim.ts` (+ `sim.worker.ts`) — side-count simulator run in a Web Worker.
- `src/engine/game.ts` — table game state machine, Hi-Lo count, decision grading.
- `src/engine/strategy.ts` — typed façade over the vendored strategy engine.
- `src/engine/vendor/cutcard/` — exact blackjack EV engine, generated basic strategy and Hi-Lo
  deviations from [noahskahn/cutcard](https://github.com/noahskahn/cutcard) (MIT, see its `LICENSE`).
- UI: React 19, TypeScript, Tailwind CSS 4, Motion.

## Verification

`npm test` checks, among other things:

- Perfect Pairs 25/12/6, six decks: 6.11% house edge (published figure).
- 21+3 Classic 9:1, six decks: 3.24% house edge (commonly published figure).
- 21+3 single-deck outcome counts equal a full enumeration of C(52,3) hands.
- Each side bet's settlement code, over 400,000 dealt rounds, agrees with the exact calculator.
- 20,000 auto-played rounds of perfect strategy: every decision graded correct and the result
  within the expected range of the exact house edge; the running count always matches the cards shown.

The vendored engine's own tests (basic strategy and house edges against Wizard of Odds figures,
Illustrious 18 / Fab 4) pass upstream.

## Next

- Game variants: Free Bet Blackjack, Blackjack Switch, Spanish 21 (need engine changes).
- More side bets (Buster Blackjack, Match the Dealer, Royal Match).
- Other counting systems for the main game, bet-spread and risk-of-ruin tools, desktop (Tauri)
  and mobile (Capacitor) packaging.
