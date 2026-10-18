# App Store listing

Copy for App Store Connect → your app → the version page and App Information. Character counts
are measured against Apple's limits.

## Names and short copy

| Field | Limit | Text | Length |
|---|---|---|---|
| Name | 30 | `CasinoGhost: Blackjack Trainer` | 30 |
| Subtitle | 30 | `Card counting & side-bet lab` | 28 |
| Promotional text | 170 | `Your edge at every count, from 10 million simulated rounds of your exact game. Train at a table that feels real, with every decision graded against the count.` | 158 |
| Keywords | 100 | `hi-lo,basic strategy,true count,21,deviations,simulator,risk of ruin,perfect pairs,21+3,casino,shoe` | 99 |

Keywords leave out words already in the name and subtitle (blackjack, trainer, card, counting,
side, bet, lab), because the App Store indexes those already. Promotional text can be changed at
any time without a new review; use it for news ("Now with …").

## Description (4,000 limit)

```
CasinoGhost is a blackjack trainer and advantage-play lab for players who want to learn the game properly: basic strategy for any rules, card counting with index plays, bet spreads and risk, and the side bets on casino floors today. Every decision is graded against the correct play for the count, and every number comes from an exact engine running on your device.

A TABLE THAT FEELS REAL
• A dealing shoe that empties as you play, with the cut card in place
• A discard tray that fills to scale, for estimating decks by eye
• A dealer who deals, peeks, calls the hands and keeps the pace
• Other players at the table, whose cards you have to count
• Four dealing speeds, from deliberate to instant drills
• Hand signals: tap to hit, swipe to stand

AN EDGE GAUGE YOU CAN TRUST
• Your edge at your count, from 10 million simulated rounds of your exact game: rules, penetration, players, count, rounding and index plays
• A band showing how far the true edge of real shoes can stray from the count
• Your game's whole curve, with the break-even count and how often each count comes up
• An optional marker with the exact edge of the cards actually left

GRADED PLAY
• Basic strategy solved for your exact rules, not copied from a chart
• Illustrious 18, Fab 4 or full index sets, or indices generated for your game
• Every mistake priced in money from the cards left, so you see which errors matter
• Accuracy by hard totals, soft totals, pairs, insurance and index plays

EIGHT COUNTING SYSTEMS
• Hi-Lo, KO, Red 7, Hi-Opt I, Hi-Opt II, Omega II, Zen and Wong Halves
• Your own true-count conventions: floor, truncate, round or exact, and decks estimated to the half or whole deck
• Running and true count on the table, or hidden for practice

THE LAB
• Simulate any game in seconds and see the edge at every count
• Evaluate a bet spread: win rate, standard deviation, risk of ruin, N0, DI and SCORE, and the bankroll you need
• Let the optimiser find the best spread for your bankroll, limits and risk
• Generate index plays for any count and rules, ranked by what they're worth

COUNT THE SIDE BETS
• Exact edge for 21+3, Perfect Pairs and Lucky Ladies, from the current shoe and any paytable
• The effect of removing each card, a count derived for each bet, and a simulation of counting it

YOUR TABLE, YOUR RULES
• 1 to 8 decks, soft 17, 3:2 or 6:5, doubling and splitting rules, surrender, peek or no hole card, penetration or a continuous shuffler, table limits
• Common tables built in, or type the rules as shorthand: "6D H17 DAS LS 3:2"

MADE FOR iPHONE AND iPAD
• Native, smooth and fast, with haptics and table sounds
• Light and dark appearance; keyboard shortcuts on iPad
• Your session is saved, including the shoe in play
• Works fully offline. No account, no ads, no tracking, no data collected

CasinoGhost is a training tool. No real money is wagered and nothing can be won. Counting cards does not guarantee winning, and casinos may refuse play to counters. If gambling stops being fun, help is free and confidential: in the US call 1-800-GAMBLER, in the UK visit BeGambleAware.org.
```

## URLs

| Field | Value |
|---|---|
| Support URL (required) | `https://kasperthefriendlyghost.github.io/CasinoGhost/support.html` |
| Marketing URL (optional) | `https://kasperthefriendlyghost.github.io/CasinoGhost/` |
| Privacy Policy URL (required) | `https://kasperthefriendlyghost.github.io/CasinoGhost/privacy.html` |

These go live once GitHub Pages is enabled (Settings → Pages → Source: GitHub Actions). Open
each one before you submit; App Review checks them.

## Category

- **Primary: Education.** CasinoGhost teaches a skill and does not offer gambling. That puts it
  beside other trainers rather than in casino charts dominated by slot games.
- **Secondary: Games**, with the subcategories **Card** and **Casino**.

Games as primary is also valid and may bring more search traffic. The choice is yours; it can be
changed with any update.

## Screenshots

Taken from the native app on the iPhone 17 Pro Max and 13-inch iPad simulators by the **Apple**
workflow. The app launches with `-screenshot <screen>`, which plays a seeded session, so each run
produces the same images. The workflow pushes them to the `ci-screenshots` branch; they are
copied into `docs/app-store/screenshots/` as JPEGs (no alpha channel).

| Display | Size | Files |
|---|---|---|
| iPhone 6.9" | 1320 × 2868 | `iphone-6.9/01-table.jpg` … `05-rules.jpg` |
| iPad 13" | 2064 × 2752 | `ipad-13/01-table.jpg` … `05-rules.jpg` |

App Store Connect scales the 6.9" set down for smaller iPhones and the 13" set for smaller iPads.
Upload them in numbered order; the first three show in search results.
