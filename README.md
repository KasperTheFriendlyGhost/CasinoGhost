# CasinoGhost

A modern blackjack trainer and advantage-play lab: basic strategy, Hi-Lo card counting with
index plays, and exact, countable side bets (21+3, Perfect Pairs, Lucky Ladies).

## What's in it

| Screen | What it does |
|---|---|
| **Table** | Animated table with a real dealing shoe (cut card included) and a clear discard tray that fill and empty to scale, so you can estimate decks by eye; your bankroll racked in chips on the rail. Every decision is graded against the strategy generated for your rules plus Hi-Lo index plays, with the dollar cost of each mistake. Running and true count pinned to the felt, table-limits placard, deal speed (slow to instant), pause, new shoe, and practice modes that hide the count or the decks-left numbers and quiz you. |
| **Dashboard** | Widgets beside the table that you choose, place left or right, and reorder: counts, cost of errors, side-bet edges, accuracy rates (hard, soft, pairs, insurance, index plays), statistics grid, stopwatch, speedometer, heat, probability curve, and charts of bankroll, true count, bet vs. count and error cost. Session stats are kept between visits until you reset them (or reset on every launch). |
| **Side Bet Lab** | Exact house edge for any paytable and deck count, the effect of removing each card, a best-fit balanced count derived automatically for the bet, and a 20,000-shoe simulation showing the edge at every true count, when to bet, and what it's worth against perfect card tracking. |
| **Strategy** | Basic-strategy chart solved for the current rules, the house edge with perfect play, and the index plays in use. |
| **Rules** | Presets, every rule as a control, table limits, and a plain-English rules box ("6 decks, dealer hits soft 17, late surrender"). |

## Keyboard

| Between rounds | | During a hand | |
|---|---|---|---|
| `1` `2` `3` `4` | add a $5 / $25 / $100 / $500 chip | `H` `S` `D` `P` `R` | hit, stand, double, split, surrender |
| `Shift` + `1`–`4` (or right-click a chip) | remove that chip | `?` | hint |
| `←` `→` | choose the betting spot | `I` / `N` | take / decline insurance |
| `]` / `[` | double / halve the bet on that spot | | |
| `Backspace` / `X` | clear the spot / clear every bet | | |
| `E` | estimate the decks left | | |
| `Space` or `Enter` | deal | | |

## Run it on your desktop

**Install it as an app (Windows, Mac, Linux).** Once GitHub Pages is on for this repository
(Settings → Pages → Source: *GitHub Actions*), every push to `main` publishes the app to
`https://kasperthefriendlyghost.github.io/CasinoGhost/`. Open that in Chrome or Edge and choose
**Install CasinoGhost** (the install icon at the right of the address bar, or menu → *Apps* →
*Install*). It gets its own window, a Start-menu / Dock icon, and works offline.

**Or double-click one file.** `CasinoGhost.html` (published next to the app, or built with
`npm run build:single` into `dist-single/index.html`) runs straight from disk in any modern
browser, no install or internet needed (fonts fall back to system fonts offline).

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
- `src/engine/game.ts` — table game state machine, Hi-Lo count, decision grading, round history,
  table limits, session clock, save/restore.
- `src/engine/session.ts` — heat (bet-to-count correlation and spread), luck vs. expectation,
  rounds per hour.
- `src/lib/dashboard.ts`, `src/components/widgets.tsx` — dashboard configuration and widgets.
- `public/sw.js`, `public/manifest.webmanifest` — offline cache and install metadata.
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
- Session tracking: outcome and accuracy tallies add up, table limits are enforced, a saved
  session restores exactly; heat, luck and pace calculations against hand-worked values.

The vendored engine's own tests (basic strategy and house edges against Wizard of Odds figures,
Illustrious 18 / Fab 4) pass upstream.

## Next

- Game variants: Free Bet Blackjack, Blackjack Switch, Spanish 21 (need engine changes).
- More side bets (Buster Blackjack, Match the Dealer, Royal Match).
- Other counting systems for the main game, bet-spread and risk-of-ruin tools, a native desktop
  build (Tauri) and mobile (Capacitor) packaging.
