# DocJob Mobile (Expo)

`apps/mobile` is the DocJob mobile client — Expo + expo-router, consuming the
same tRPC API (`@docjob/api`) the web app talks to, over
`Authorization: Bearer <accessToken>`. It ships a strict type-only boundary
to the server packages (`import type { AppRouter } from '@docjob/api'` only —
never a value import, never `@docjob/core`/`@docjob/db`/`@docjob/auth`), so
Prisma's query engine, argon2's native addon, and the OpenAI SDK never enter
the React Native bundle. See the repo-root `CLAUDE.md` and
`docs/superpowers/plans/2026-07-16-sp4b-mobile-expo-app.md` for the full
architecture writeup.

## Running on a device

You need the API host reachable from wherever the app runs. Set it via
`EXPO_PUBLIC_API_URL` (see `src/lib/config.ts` — falls back to
`http://localhost:3000` if unset, which only works from a simulator/emulator
on the same machine as the Next.js dev server, never from a physical device
on Wi-Fi):

```bash
# from apps/mobile
EXPO_PUBLIC_API_URL=http://<your-lan-ip-or-host>:3000 pnpm dev
```

(`pnpm dev` runs `expo start`.) Then either:

- **Expo Go** — scan the QR code with the Expo Go app (iOS/Android). Fastest
  loop for UI iteration, but Expo Go can't load native modules that aren't
  part of the Expo Go binary itself; everything this app currently uses
  (`expo-secure-store`, `expo-localization`, `expo-system-ui`, `react-native-webview`,
  `@react-native-async-storage/async-storage`) ships inside Expo Go's SDK, so
  this should work end-to-end today. If a future task adds a config plugin or
  a native module outside Expo Go's bundled set, switch to a dev build below.
- **A dev build** (`expo-dev-client`) — required once any native
  config/module falls outside Expo Go's bundled set. Build one via EAS (see
  below) or locally with `expo run:ios` / `expo run:android` (needs Xcode /
  Android Studio installed).

## EAS builds

`eas.json` defines four build profiles:

- `development` — a dev-client build (`developmentClient: true`,
  `distribution: internal`), points `EXPO_PUBLIC_API_URL` at
  `http://localhost:3000`.
- `preview` — internal distribution (ad-hoc/TestFlight-internal on iOS, a
  direct-install APK on Android) against the production API at
  `https://docjob.kz`.
- `direct` — production API, internal distribution and a directly installable
  Android APK. This is the profile for the website download release.
- `production` — store-ready builds (an app bundle on Android, auto-increments
  the build number) and points at `https://docjob.kz`.

The first public direct APK is `1.0.0 (versionCode 1)`. Every Android update
must increment `versionCode` and must be signed by the same release key. The
key is intentionally stored outside this repository and must never be copied
to the VPS. Before switching the `direct` profile to EAS cloud builds, upload
that existing key through `eas credentials`; allowing EAS to create a new key
would make the new APK impossible to install over the website build.

The monorepo currently pins TypeScript `~5.9.3`, while Expo SDK 57 recommends
`~6.0.3`; therefore `expo install --check` reports that single compatibility
warning. This release keeps the shared pin because lint, TypeScript, all Jest
tests and the signed native build pass. Upgrade the monorepo to TypeScript 6
as a separate compatibility change instead of changing only the mobile app.

```bash
# from apps/mobile
npx eas-cli login                      # requires an Expo account — see below
npx eas-cli build:configure            # first run only: links this app to an EAS project, fills app.json's extra.eas.projectId
npx eas-cli build --platform ios --profile development
npx eas-cli build --platform android --profile development
```

### What REQUIRES the owner's accounts — cannot be done here or in CI

- **Expo/EAS account** — `eas-cli login` and every `eas build`/`eas submit`
  call needs an authenticated Expo account with access to this project (or
  permission to create one via `eas build:configure`). Free tier covers
  development/preview builds; team/paid tiers unlock more concurrent build
  credits.
- **Apple Developer Program membership ($99/year)** — required for any iOS
  build that isn't purely a simulator build, and mandatory for
  TestFlight/App Store distribution. `eas.json`'s `submit.production.ios`
  block (`appleId`, `ascAppId`, `appleTeamId`) needs real values from an
  active Apple Developer account — replace the `REPLACE_WITH_*` placeholders
  there before running `eas submit --platform ios`.
- **Google Play Developer account ($25 one-time)** — required to publish to
  the Play Store (internal testing track or beyond). `eas.json`'s
  `submit.production.android` block expects a service-account JSON key
  (`serviceAccountKeyPath`, from Google Play Console → API access) — this
  repo does NOT include one; generate and place it at
  `apps/mobile/google-service-account.json` (or update the path) before
  running `eas submit --platform android`. **Never commit that key file.**
- **Store listing assets & metadata** (screenshots, privacy policy URL, app
  description, content rating questionnaire, data-safety form) — first-party
  business/legal content only the product owner can provide.
- **Push notification credentials** (APNs key/Android FCM), if a future task
  adds push — same "owner's developer account" requirement, not wired up in
  this task.

```bash
# Once the above accounts/credentials exist:
npx eas-cli build --platform ios --profile production
npx eas-cli build --platform android --profile production
npx eas-cli submit --platform ios --profile production
npx eas-cli submit --platform android --profile production
```

## What was verified in-repo vs what needs a device

**Verified here (typecheck + jest-expo, no simulator):**

- `pnpm --filter mobile typecheck` — `tsc --noEmit` across the whole app,
  including every screen now wired through `useTranslation()`.
- `pnpm --filter mobile test` — `jest-expo` + `@testing-library/react-native`:
  every screen/component's unit + component tests, the RN-bundle boundary
  test (`src/__tests__/boundary.test.ts`), the i18n key-coverage test
  (`src/i18n/key-coverage.test.ts` — every `t('...')` call resolves in BOTH
  `ru.json` and `kk.json`, and the two catalogs carry identical key sets),
  and the offline-persistence unit tests
  (`src/lib/query-persist.test.ts` — the AsyncStorage persister round-trips
  correctly, mutations are never dehydrated, the `TOO_MANY_REQUESTS` retry
  predicate is correct).
- `pnpm --filter mobile lint` — ESLint incl. the `no-restricted-imports`
  boundary rule.
- A local Android release APK was assembled with JDK 17 / SDK 36, the
  production API URL, and the long-lived release key. `apksigner` verified its
  v2 signature, `zipalign` passed, and `apkanalyzer` reported
  `com.docjob.app`, version `1.0.0 (1)`, min SDK 24 and target SDK 36. The
  artifact is kept outside Git.
- Root `pnpm typecheck && pnpm test && pnpm build` — confirms `apps/mobile`
  didn't break the rest of the monorepo (other packages still typecheck/
  test/build; `apps/mobile` itself has no `build` script — Expo apps ship via
  EAS, not `next build`/`tsc`, so it's a no-op in the root `build` pipeline).

**Cannot be verified without a real device/simulator or store accounts
(explicitly NOT claimed as tested):**

- **On-device runtime** of any screen — jest-expo/RNTL render components in a
  simulated JS environment, not an actual iOS/Android runtime. Layout,
  gestures, keyboard behavior, safe-area insets, and platform-specific
  styling quirks are unverified.
- **`expo-secure-store` Keychain/Keystore semantics** — `token-store.test.ts`
  mocks the native module entirely; real device behavior around
  `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, biometric prompts, and Keychain
  availability during app-launch-before-unlock is unverified.
- **`react-native-webview` fidelity** — `case-body-webview.tsx`'s rendering
  of `bodyHtml` (fonts, `<mark>` highlighting, table/image layout,
  `javaScriptEnabled={false}` actually blocking script execution) is
  unverified outside a real WebView engine.
- **`expo-localization`'s real device locale detection** — jest-setup.ts
  mocks `getLocales()` to return a fixed `en` locale; real iOS/Android locale
  resolution (including a device already set to Kazakh, or a locale change
  while the app is backgrounded) is unverified.
- **AsyncStorage persistence surviving an actual app kill/restart** —
  `query-persist.test.ts` and the language-toggle test exercise the mocked
  AsyncStorage within a single Jest process; real on-disk persistence across
  a cold app restart (and correctly rehydrating Search/Cases/Saved/News from
  it while offline) is unverified.
- **Universal/deep-link resolution** (`scheme: "docjob"`, added for an
  eventual password-reset deep link) — no link-handling route exists yet in
  this app; the scheme is registered but unexercised.
- **EAS cloud build/submit itself** — the signed APK was built locally with
  Gradle; the `eas.json` profiles have not yet been exercised against an EAS
  project or store account.
- **Push notifications, biometric auth, or any other native capability** not
  currently wired into this app.

If you need any of the above verified, the fastest path is: `eas build
--profile development --platform ios|android`, install the resulting dev
build on a real device or simulator, then `expo start --dev-client` against
it.
