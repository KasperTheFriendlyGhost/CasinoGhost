# Shipping CasinoGhost to the App Store

Everything that can be prepared in the repository is done. The rest needs your Apple account,
and either a Mac or the GitHub Actions workflow with signing secrets. This page is the checklist.

| File | What it is |
|---|---|
| [listing.md](listing.md) | Name, subtitle, keywords, description, URLs, category, screenshots |
| [app-store-connect.md](app-store-connect.md) | Answers for App Privacy, the age rating, App Review notes, export compliance, content rights |
| [screenshots/](screenshots/) | 6.9" iPhone and 13" iPad screenshots (`npm run build && npm run screenshots`) |
| [`public/privacy.html`](../../public/privacy.html), [`public/support.html`](../../public/support.html) | Privacy policy and support page, published with GitHub Pages |
| [`.github/workflows/ios.yml`](../../.github/workflows/ios.yml) | Mac CI: Simulator build on every push; TestFlight upload when run by hand |

## Already in the project

- **Capacitor iOS app** (`ios/`), Swift Package Manager, bundle ID `com.casinoghost.app`, iOS 16.4+,
  iPhone (portrait) and iPad (all orientations), with a shared `App` scheme for command-line builds.
- **App icon** (1024 px, opaque) and **launch screen**, rendered from `assets/*.svg` by
  `node scripts/generate-app-assets.mjs`.
- **Privacy manifest** (`ios/App/App/PrivacyInfo.xcprivacy`): no tracking, no data collected,
  UserDefaults declared with reason `CA92.1`.
- `ITSAppUsesNonExemptEncryption = false`, so App Store Connect skips the export-compliance
  questions.
- **Native behaviour:**
  - haptics;
  - storage that survives iOS clearing the WebView;
  - a status bar that follows the theme;
  - a splash fade;
  - links open in an in-app Safari sheet;
  - the session pauses when the app goes to the background;
  - the shoe in play is restored after a relaunch.
- **Offline by design:** fonts, card art and code are bundled, and the app makes no network requests.

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
   across the whole store. If `com.casinoghost.app` is taken, choose another, then change `appId`
   in `capacitor.config.ts` and `PRODUCT_BUNDLE_IDENTIFIER` in the Xcode project to match.
3. **Check the URLs** in [listing.md](listing.md#urls) open.
4. **Upload a build.** Use either option.

   *Option A, on a Mac:*
   ```sh
   npm ci
   npm run ios:sync      # web build + copy into the iOS project
   npm run ios:open      # opens Xcode
   ```
   Then in Xcode:
   1. Select the **App** target → **Signing & Capabilities** and choose your team. Leave
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
the *Build number* field when you run the workflow. The version comes from `package.json`.

The signing and upload steps can only be proven with your account. If the first run fails at
*Archive* or *Sign and upload*, the log names the missing permission or agreement. The usual
causes are an API key without the Admin role, or unsigned agreements in App Store Connect →
Business.

## Device checklist

These checks need real hardware; a Linux container and a desktop browser can't cover them.

- [ ] Launch: the splash fades straight into the table, with no white flash.
- [ ] Safe areas:
  - nothing sits under the Dynamic Island or the home indicator;
  - the tab bar clears the home indicator;
  - the action buttons stay above the tab bar.
- [ ] Haptics: chip taps, decisions, mistakes and wins. Settings → Haptics turns them off.
- [ ] Sound: the first tap after launch unlocks audio, and the silent switch mutes it.
- [ ] Persistence:
  1. play a few rounds;
  2. swipe the app away and reopen it;
  3. the bankroll, statistics and shoe are as you left them.
- [ ] Background: the session clock pauses when you leave the app.
- [ ] Links: the Settings links open in a Safari sheet, and Done returns to the app.
- [ ] Appearance: System, Light and Dark switch the theme and the status-bar colour.
- [ ] iPad:
  - rotation;
  - Split View and Stage Manager sizes;
  - a hardware keyboard (1–4, Space, H, S, D, P, R);
  - the dashboard beside the table.
- [ ] VoiceOver: a basic pass through betting, playing a hand and Settings.
- [ ] Settings → Data → Erase all data returns the app to a fresh install.

## Before each update

1. Bump `version` in `package.json`, and `MARKETING_VERSION` in the Xcode project if you upload
   from Xcode.
2. Run `npm test` and `npm run build`. If the UI changed, run `npm run screenshots` and upload
   the new images.
3. Upload through Option A or B, then add "What's New" text on the version page.

## Known gaps worth doing next

- **Dynamic Type:** text sizes are fixed and don't yet follow the iOS text-size setting.
- **VoiceOver:** controls are labelled, but the table itself (cards dealt, dealer actions) isn't
  narrated yet.
- **Bundle size:** the main script is about 1 MB, mostly the 52 card faces. That doesn't matter
  for a local app, but lazy-loading would speed up the web version.
- **Game variants:** Free Bet, Blackjack Switch and Spanish 21.
- **Mac:** App Store Connect offers iPad apps on Apple-silicon Macs by default. Leave that on, or
  turn it off under Pricing and Availability until it has been tested.
