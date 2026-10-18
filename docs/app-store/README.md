# Shipping CasinoGhost to the App Store

Everything that can be prepared in the repository is done. The rest needs your Apple account,
and either a Mac or the GitHub Actions workflow with signing secrets. This page is the checklist.

| File | What it is |
|---|---|
| [listing.md](listing.md) | Name, subtitle, keywords, description, URLs, category, screenshots |
| [app-store-connect.md](app-store-connect.md) | Answers for App Privacy, the age rating, App Review notes, export compliance, content rights |
| [screenshots/](screenshots/) | 6.9" iPhone and 13" iPad screenshots of the native app (from the Apple workflow) |
| [`public/privacy.html`](../../public/privacy.html), [`public/support.html`](../../public/support.html) | Privacy policy and support page, published with GitHub Pages |
| [`.github/workflows/apple.yml`](../../.github/workflows/apple.yml) | Mac CI on every push: engine, Swift package and app tests on iPhone and iPad simulators, and screenshots |
| [`.github/workflows/ios.yml`](../../.github/workflows/ios.yml) | TestFlight upload, run by hand |

## Already in the project

- **The native app** (`apple/CasinoGhost.xcodeproj`), with a shared `CasinoGhost` scheme for
  command-line builds:
  - SwiftUI on the Rust engine (`engine/`), linked as an XCFramework;
  - bundle ID `com.casinoghost.app`, iOS 17+;
  - iPhone (portrait) and iPad (all orientations, Split View and Stage Manager).
- **App icon** (1024 px, opaque) and **launch screen** (the theme's background colour).
- **Privacy manifest** (`apple/CasinoGhost/PrivacyInfo.xcprivacy`):
  - no tracking and no data collected;
  - UserDefaults declared with reason `CA92.1`;
  - the system clock declared with reason `35F9.1`.
- `ITSAppUsesNonExemptEncryption = false`, so App Store Connect skips the export-compliance
  questions.
- **Native behaviour:**
  - haptics and table sounds;
  - the session is saved after every round, and the shoe in play is restored after a relaunch;
  - the session clock pauses when the app goes to the background;
  - light and dark appearance;
  - hardware-keyboard shortcuts on iPad.
- **Offline by design:** card art, sounds and the engine are bundled, and the app makes no network
  requests.

## What you need

1. **Apple Developer Program** membership, $99 a year, at developer.apple.com/programs.
   - *Individual:* the store shows your legal name as the seller.
   - *Organization:* the store shows the company name. This needs a D-U-N-S number and takes longer to approve.
2. **A way to build:**
   - *A Mac with Xcode 26 or later:* the simplest route for a first upload.
   - *No Mac:* the TestFlight job in GitHub Actions, using an App Store Connect API key.
3. **GitHub Pages switched on**, because App Review opens the privacy and support URLs. Go to
   Settings → Pages, set *Source: GitHub Actions*, then re-run the "Deploy to GitHub Pages"
   workflow.

## Step by step

1. **Enrol** in the Apple Developer Program and wait for the confirmation email.
2. **Create the app record.** In App Store Connect, go to Apps → + → New App:
   - Platform: iOS
   - Name: `CasinoGhost: Blackjack Trainer`
   - Primary language: English (U.S.)
   - Bundle ID: `com.casinoghost.app`
   - SKU: `casinoghost-ios`

   If the bundle ID isn't offered, register it first under Certificates, Identifiers & Profiles →
   Identifiers → +, as an explicit App ID with no extra capabilities. Bundle IDs are unique
   across the whole store. If `com.casinoghost.app` is taken, choose another, then change
   `PRODUCT_BUNDLE_IDENTIFIER` in the Xcode project to match.
3. **Check the URLs** in [listing.md](listing.md#urls) open.
4. **Upload a build.** Use either option.

   *Option A, on a Mac with Xcode 26 and [Rust](https://rustup.rs):*
   ```sh
   scripts/build-core-apple.sh          # builds the engine for iOS (the scheme also runs it)
   open apple/CasinoGhost.xcodeproj
   ```
   Then in Xcode:
   1. Select the **CasinoGhost** target → **Signing & Capabilities** and choose your team. Leave
      "Automatically manage signing" on.
   2. Set the run destination to **Any iOS Device**, then choose **Product → Archive**.
   3. In the Organizer, choose **Distribute App → App Store Connect → Distribute**.

   *Option B, GitHub Actions, no Mac needed:*
   1. Add the secrets listed in [CI signing](#ci-signing) below.
   2. Open Actions → **iOS** → **Run workflow**. The job archives, signs and uploads the build.
5. **TestFlight.** About 5–30 minutes after an upload, the build appears under TestFlight.
   - *Internal testing:* add yourself (up to 100 people on your team, no review). Install
     the TestFlight app on your iPhone and open the invite.
   - *External testers:* needs a short beta review first.
6. **Test on a real device** using the [device checklist](#device-checklist) below.
7. **Fill in the version page:**
   - screenshots;
   - listing copy and URLs ([listing.md](listing.md));
   - App Privacy, age rating and review notes ([app-store-connect.md](app-store-connect.md));
   - pricing;
   - the build, selected from TestFlight.
8. **Submit for review** with *Manually release this version*. A first review usually takes
   one to three days. When it's approved, press **Release**.

## CI signing

Add these secrets under Settings → Secrets and variables → Actions:

| Name | Where to find it |
|---|---|
| `APPLE_TEAM_ID` | developer.apple.com → Account → Membership details, a 10-character Team ID. It can be a variable instead of a secret. |
| `ASC_KEY_ID` | App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys → **Generate API Key**. Give the key the **Admin** role, because cloud-managed signing has to create certificates and profiles. This is the key's ID. |
| `ASC_ISSUER_ID` | The Issuer ID shown above the list of keys on the same page. |
| `ASC_KEY_P8` | The full contents of the downloaded `AuthKey_XXXXXXXXXX.p8`, including the BEGIN and END lines. Apple lets you download it only once. |

The job uses Xcode's cloud-managed certificates, so there are no `.p12` files or provisioning
profiles to export and store. Build numbers come from the workflow run number, which always
increases. If you uploaded a higher build number by hand from Xcode, enter a larger number in
the *Build number* field when you run the workflow. The version comes from `MARKETING_VERSION`
in the Xcode project.

The signing and upload steps can only be proven with your account. If the first run fails at
*Archive* or *Sign and upload*, the log names the missing permission or agreement. The usual
causes are an API key without the Admin role, or unsigned agreements in App Store Connect →
Business.

## Device checklist

These checks need real hardware. The simulator runs in CI cannot cover them.

- [ ] Launch: the launch screen goes straight into the table, with no white flash.
- [ ] Safe areas:
  - nothing sits under the Dynamic Island or the home indicator;
  - the action buttons stay above the tab bar.
- [ ] Feel:
  - the deal, flips and chip moves are smooth at 120 Hz on a ProMotion iPhone;
  - the gauge needle and the marker on the curve glide as the count changes.
- [ ] Edge gauge: on first launch it calibrates (a few seconds, with a progress bar). After that,
  changing a rule recalibrates, and returning to an earlier game is instant (cached).
- [ ] Lab: a simulation and an index generation finish in seconds, and Cancel stops them.
- [ ] Haptics: chip taps, decisions, mistakes and wins. Settings turns them off.
- [ ] Sound: table sounds play, and the silent switch mutes them.
- [ ] Persistence:
  1. play a few rounds;
  2. swipe the app away and reopen it;
  3. the bankroll, statistics and shoe are as you left them.
- [ ] Background: the session clock pauses when you leave the app.
- [ ] Appearance: System, Light and Dark switch the theme.
- [ ] iPad:
  - rotation;
  - Split View and Stage Manager sizes;
  - a hardware keyboard (Space to deal; H, S, D, P, R to play);
  - the dashboard beside the table in landscape.
- [ ] VoiceOver: a basic pass through betting, playing a hand, the gauge and Settings.
- [ ] Settings → Erase all data returns the app to a fresh install.

## Before each update

1. Bump `MARKETING_VERSION` in the Xcode project (and `version` in `engine/Cargo.toml` if the
   engine changed).
2. Check that the Apple workflow is green. If the UI changed, take the new screenshots from the
   `ci-screenshots` branch.
3. Upload through Option A or B, then add "What's New" text on the version page.

## Known gaps worth doing next

- **Dynamic Type:** the table and gauges use fixed sizes. Forms and lists follow the text-size
  setting.
- **VoiceOver:** controls and the gauge are labelled, but dealing isn't narrated card by card yet.
- **Pro unlock:** a one-time purchase (StoreKit 2) for the Lab and generated indices. This needs a
  Paid Apps agreement in App Store Connect.
- **Game variants:** Free Bet, Blackjack Switch and Spanish 21.
- **Mac:** App Store Connect offers iPad apps on Apple-silicon Macs by default. Leave that on, or
  turn it off under Pricing and Availability until it has been tested.
