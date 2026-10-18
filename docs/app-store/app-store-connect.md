# App Store Connect answers

What to enter in each App Store Connect questionnaire for CasinoGhost 1.0, and why. If the app
changes (analytics, accounts, purchases, online features), revisit every section here.

## App Privacy → Data collection

**"Do you or your third-party partners collect data from this app?" → No, we do not collect data from this app.**

The label will read **Data Not Collected**. This is accurate because:

- The app makes no network requests of its own. Card art, sounds and the engine are all in the
  bundle, and every calculation runs on the device.
- There is no analytics, crash-reporting, advertising or account SDK.
- Settings stay on the device in UserDefaults. The saved session and cached analysis are stored
  as files in the app's Application Support folder. Apple does not count data that never leaves
  the device as "collected".
- Links to outside sites (help lines, privacy policy, support) open in Safari, which is governed
  by those sites and by Safari, not by the app.

The privacy manifest `apple/CasinoGhost/PrivacyInfo.xcprivacy` says the same thing:

- no tracking;
- no collected data types;
- UserDefaults accessed for the app's own settings (reason `CA92.1`);
- the system clock used to time events inside the app (reason `35F9.1`).

**Tracking → No.** There is no App Tracking Transparency prompt, because nothing tracks.

## Age rating questionnaire

Answer as below; App Store Connect then calculates the rating.

| Question | Answer |
|---|---|
| Simulated gambling | **Frequent/Intense**. Blackjack is the entire app. |
| Gambling (real money) | **No** |
| Contests | No |
| Cartoon, realistic or graphic violence | None |
| Profanity or crude humour | None |
| Mature or suggestive themes | None |
| Sexual content or nudity | None |
| Horror or fear themes | None |
| Alcohol, tobacco or drug use or references | None |
| Medical or treatment information | None |
| Unrestricted web access | **No**. Only fixed links open, in a Safari sheet; there is no browser. |
| User-generated content, messaging or chat | No |
| Advertising | No |
| Parental controls / age assurance | No |

Frequent simulated gambling puts the app in the top tier: **18+** under Apple's 2025 rating
system (which replaced 17+). Some regions add their own rule; Australia, for example, rates
simulated gambling R18+. Take the rating the questionnaire gives; don't try to talk it down, or
App Review will.

## App Review Information

- **Sign-in required:** No. Leave the demo account fields empty.
- **Contact:** your name, phone and email (only App Review sees these).
- **Notes:** paste the block below.

```
CasinoGhost is a blackjack training tool. No real money is involved: there are no purchases, no deposits, no prizes, no ads and no accounts. The bankroll is a practice number that can be reset in Settings.

How to try it:
1. Table tab: tap a chip to bet, then Deal. Choose Hit, Stand, Double, Split or Surrender. Every decision is graded, and the lightbulb shows the correct play. The shoe empties and the discard tray fills as cards are played.
2. Scroll down on the Table tab for the dashboard: the edge gauge (your edge at the current count, from a simulation of your exact game), counts, accuracy, the cost of errors, side-bet edges and session charts. On iPad in landscape the dashboard sits beside the table.
3. Lab tab: simulate any game, evaluate or optimise a bet spread (win rate, risk of ruin), generate index plays for any count, and analyse side bets for any paytable. A simulation takes a few seconds.
4. Strategy and Rules tabs: change a rule (for example decks or soft 17) and the strategy chart and house edge are recomputed. Rules can also be typed as shorthand, such as "6D H17 DAS LS".
5. Settings: dealing speed, sound, haptics, appearance, reset and erase data, responsible-gambling resources, privacy policy.

The app is native SwiftUI with its maths engine compiled in, and works fully offline. It has haptic feedback, table sounds, a launch screen, and saves the session after every round, including the shoe in play. It supports iPhone (portrait) and iPad (all orientations, Split View), light and dark mode, and hardware keyboards on iPad.

It is rated for simulated gambling and includes help-line links (NCPG, BeGambleAware) in Settings.
```

## Export compliance

`ITSAppUsesNonExemptEncryption` is already `false` in `Info.plist`, so App Store Connect will not
ask. The app contains no encryption of its own; HTTPS inside the Safari sheet is Apple's.

## Content rights

**"Does your app contain, show, or access third-party content?" → Yes, and I have the rights.**

| Content | Source | Licence |
|---|---|---|
| Card faces | Adrian Kennard's SVG deck | CC0 (public domain) |
| Strategy engine | cutcard (vendored at commit cee4101) | MIT |
| Fonts | Big Shoulders Display, Figtree, JetBrains Mono (via Fontsource) | SIL Open Font License 1.1 |
| Icons | Lucide | ISC |

Everything else (shoe, tray, dealer, chips, card back, app icon) was drawn for CasinoGhost.

## Pricing and availability

Your decision. The app has no in-app purchases, so the simplest options are:

- **Free:** widest reach, nothing more to set up.
- **Paid upfront** (for example $4.99–$9.99): needs the Paid Apps Agreement, banking and tax
  forms in App Store Connect → Business before the price can be set.

A later free version with a one-time "Pro" unlock would need StoreKit and a new review; nothing in
1.0 depends on it.

## Version release

Choose **Manually release this version**, so you can check the live listing and the GitHub Pages
links before the app appears in the store.
