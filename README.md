# CasinoGhost

A blackjack trainer and advantage-play lab. It covers basic strategy for any rules, eight
counting systems with index plays, exact edge and risk analysis, and countable side bets (21+3,
Perfect Pairs, Lucky Ladies).

CasinoGhost comes in two forms:

- **The iPhone and iPad app** (`apple/`): native SwiftUI on a Rust engine (`engine/`). This is
  the flagship.
- **A web version** (`src/`) for desktop browsers, which can be installed as an app or run from a
  single HTML file.

## The iPhone and iPad app

| Screen | What it does |
|---|---|
| **Table** | A dealer deals each card out of a shoe into a discard tray that fills to scale, so you can estimate decks by eye. Other players at the table take cards you have to count. Every decision is graded against basic strategy for your rules plus the index plays you've chosen, and each mistake is priced in dollars from the cards actually left. It has hand signals (tap to hit, swipe to stand), keyboard shortcuts on iPad, haptics and table sounds. The session, including the shoe in play, is saved after every round. |
| **Edge gauge** | Your edge at your count, from 10 million simulated rounds of your exact game, smoothed into one curve. The band shows the 10th–90th percentile of the true edge of real shoes at that count. An optional marker gives the exact edge of the cards left. Below the dial is your game's whole curve, with the break-even count and how often each count comes up. |
| **Dashboard** | Counts (which can be hidden for practice), accuracy by hand type, the cost of errors, side-bet edges from the current shoe, bankroll against expectation with a luck measure, session statistics and a decision log. |
| **Lab** | **Simulator:** any rules, count, true-count convention and index set, with the edge and frequency at every count. **Bet plans:** win rate, SD, risk of ruin (lifetime and trip), N0, DI, SCORE and the bankroll for a target risk, plus an optimiser that finds the best ramp within your limits. **Index generator:** indices for your exact rules, count and rounding, compared with the published ones. **Side bets:** exact odds for any paytable, effects of removal, a derived count and a simulation of counting it. |
| **Strategy** | The basic-strategy chart solved for the current rules, the house edge with perfect play, and the index plays in use. |
| **Rules** | Presets with a verdict on each table; every rule as a control (1–8 decks, H17/S17, 3:2 to 6:5, doubling, DAS, splitting to 2–4 hands, RSA, hitting split aces, late or early surrender, peek or no hole card, penetration or a CSM); table conditions; and a box that reads rules typed as shorthand or plain English. Also the count system (Hi-Lo, KO, Red 7, Hi-Opt I and II, Omega II, Zen, Wong Halves), true-count rounding and deck estimation, and the index set. |

How every number is computed and checked is in [docs/ENGINE.md](docs/ENGINE.md).

### Build it

You need a Mac with Xcode 26 and [Rust](https://rustup.rs).

```bash
scripts/build-core-apple.sh          # Rust engine → XCFramework + Swift bindings (skips if unchanged)
open apple/CasinoGhost.xcodeproj     # the scheme also runs the script before each build
cd engine && cargo test --release    # engine tests (any platform)
```

The **Apple** workflow runs on every push:

1. the engine tests on Linux;
2. the engine build for iOS, the simulator and macOS;
3. the Swift package tests;
4. the app's build and tests on an iPhone and an iPad simulator;
5. screenshots of every screen, pushed to the `ci-screenshots` branch.

The **iOS** workflow, run by hand, archives and uploads to TestFlight. The App Store kit is in
[`docs/app-store/`](docs/app-store/README.md).

### Layout

- `engine/core/` — the engine:
  - exact analysis (`ca.rs`) and basic strategy (`strategy.rs`);
  - simulator (`sim.rs`), index generator (`indices.rs`), risk (`risk.rs`), edge model (`edge.rs`);
  - side bets (`sidebets.rs`) and the table game (`game.rs`).
- `engine/ffi/` — the Swift interface (UniFFI). `engine/bindgen/` generates the Swift bindings.
- `apple/CasinoGhostCore/` — Swift package wrapping the engine's XCFramework.
- `apple/CasinoGhost/` — the SwiftUI app:
  - `Table/` (felt, shoe, tray, cards, chips, controls);
  - `Dashboard/` (edge gauge and cards);
  - `Lab/`, `Strategy/`, `Rules/`, `Settings/`;
  - `Feel/` (haptics, sound).
- `scripts/render-native-cards.mjs`, `scripts/render-native-sounds.py` — card images and table
  sounds for the app.

## The web version

### What's in it

| Screen | What it does |
|---|---|
| **Table** | A simulated dealer who announces the game, deals each card out of a red acrylic shoe (weight, cut card and all), peeks for blackjack, turns the hole card and draws at a realistic pace, pays or takes your chips, and sweeps the cards into a clear discard tray that fills to scale, so you can estimate decks by eye. Real playing cards with full court art; your bankroll racked in chips on a padded rail. Every decision is graded against the strategy generated for your rules plus Hi-Lo index plays, with the dollar cost of each mistake. Running and true count pinned to the felt, table-limits placard, deal speed (slow to instant), pause, new shoe, and practice modes that hide the count or the decks-left numbers and quiz you. |
| **Dashboard** | Widgets beside the table that you choose, place left or right, and reorder: counts, gauges (true count, estimated edge, shoe dealt, accuracy), deck estimation, cost of errors, side-bet edges, accuracy rates (hard, soft, pairs, insurance, index plays), statistics grid, stopwatch, speedometer, heat, probability curve, and charts of bankroll, true count, bet vs. count and error cost. Session stats are kept between visits until you reset them (or reset on every launch). |
| **Side Bet Lab** | Exact house edge for any paytable and deck count, the effect of removing each card, a best-fit balanced count derived automatically for the bet, and a 20,000-shoe simulation showing the edge at every true count, when to bet, and what it's worth against perfect card tracking. |
| **Strategy** | Basic-strategy chart solved for the current rules, the house edge with perfect play, and the index plays in use. |
| **Rules** | Presets, every rule as a control, table limits, and a plain-English rules box ("6 decks, dealer hits soft 17, late surrender"). |

### Keyboard

| Between rounds | | During a hand | |
|---|---|---|---|
| `1` `2` `3` `4` | add a $5 / $25 / $100 / $500 chip | `H` `S` `D` `P` `R` | hit, stand, double, split, surrender |
| `Shift` + `1`–`4` (or right-click a chip) | remove that chip | `?` | hint |
| `←` `→` | choose the betting spot | `I` / `N` | take / decline insurance |
| `]` / `[` | double / halve the bet on that spot | | |
| `Backspace` / `X` | clear the spot / clear every bet | | |
| `E` | estimate the decks left | | |
| `Space` or `Enter` | deal | | |

### Run it on your desktop

**Install it as an app (Windows, Mac, Linux).** Once GitHub Pages is on for this repository
(Settings → Pages → Source: *GitHub Actions*), every push to `main` publishes the app to
`https://kasperthefriendlyghost.github.io/CasinoGhost/`. Open that in Chrome or Edge and choose
**Install CasinoGhost** (the install icon at the right of the address bar, or menu → *Apps* →
*Install*). It gets its own window, a Start-menu / Dock icon, and works offline.

**Or double-click one file.** `CasinoGhost.html` (published next to the app, or built with
`npm run build:single` into `dist-single/index.html`) runs straight from disk in any modern
browser, no install or internet needed (fonts fall back to system fonts offline).

### Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # engine tests (side-bet maths, simulator, game engine)
npm run build        # production build in dist/
npm run build:single # one self-contained HTML file in dist-single/
```

### How it's built

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
- `src/lib/native.ts`, `src/lib/sound.ts` — browser storage, vibration and links, and
  synthesised table sounds.
- `public/privacy.html`, `public/support.html` — privacy policy and support page.
- Fonts: Big Shoulders Display, Figtree and JetBrains Mono (SIL OFL), bundled via Fontsource.
- `src/engine/strategy.ts` — typed façade over the vendored strategy engine.
- `src/engine/vendor/cutcard/` — exact blackjack EV engine, generated basic strategy and Hi-Lo
  deviations from [noahskahn/cutcard](https://github.com/noahskahn/cutcard) (MIT, see its `LICENSE`).
- `src/assets/cards/` — card faces: Adrian Kennard's SVG playing cards (https://www.me.uk/cards/),
  CC0 1.0, via [letele/playing-cards](https://github.com/letele/playing-cards).
- `src/components/Dealer.tsx`, `ShoeTray.tsx` — dealer station, shoe and discard tray artwork.
- UI: React 19, TypeScript, Tailwind CSS 4, Motion.

### Verification

The engine's checks are listed in [docs/ENGINE.md](docs/ENGINE.md). For the web version, `npm test` checks, among other things:

- Perfect Pairs 25/12/6, six decks: 6.11% house edge (published figure).
- 21+3 Classic 9:1, six decks: 3.24% house edge (commonly published figure).
- 21+3 single-deck outcome counts equal a full enumeration of C(52,3) hands.
- Each side bet's settlement code, over 400,000 dealt rounds, agrees with the exact calculator.
- 20,000 auto-played rounds of perfect strategy: every decision graded correct and the result
  within the expected range of the exact house edge; the running count always matches the cards shown.
- Session tracking: outcome and accuracy tallies add up, table limits are enforced, a saved
  session restores exactly (including the shoe and running count; a shoe saved under other rules
  or tampered with is ignored); heat, luck and pace calculations against hand-worked values.

The vendored engine's own tests (basic strategy and house edges against Wizard of Odds figures,
Illustrious 18 / Fab 4) pass upstream.

## Next

- **Pro unlock:** a one-time in-app purchase (StoreKit 2) for the Lab and the generated indices.
- **Drills:** flash-card drills for counting down a deck, true-count conversion and index plays.
- **Game variants:** Free Bet Blackjack, Blackjack Switch and Spanish 21.
- **More side bets:** Buster Blackjack, Match the Dealer and Royal Match.
- **Team and shuffle play:** back-counting and wonging at the table, and shuffle-tracking analysis.
- **Accessibility:** Dynamic Type throughout, and VoiceOver narration of the table.
