# SP-4b: DocJob Mobile (Expo) App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the complete DocJob mobile app in `apps/mobile` (Expo + expo-router) consuming the `@docjob/api` tRPC endpoint over `Authorization: Bearer` (using the SP-4a mobile-transport auth), with a strict type-only boundary to the server packages, single-flight token refresh, expo-secure-store token storage, the 5 product tabs, i18n RU+KK, and offline React Query persistence. Everything buildable + testable in-repo (typecheck + jest-expo) is verified here; on-device runtime, EAS builds, and store submission are documented for the account/device owner.

**Architecture:** `apps/mobile` is a pnpm workspace package that imports ONLY `import type { AppRouter } from '@docjob/api'` (never a value import) + runtime values from `@docjob/types`, deriving all DTOs via `inferRouterOutputs<AppRouter>` — so prisma/argon2/openai never enter the Metro bundle. A tRPC React-Query client (`httpBatchLink`, NO transformer) carries the access JWT as a Bearer header via an `authFetch` that replicates the web single-flight 401→refresh→retry (the refresh token is single-use with family reuse-detection, so parallel refreshes are forbidden). Tokens live in `expo-secure-store`. expo-router gives an auth stack + a session-gated tab navigator with a distinct pending-approval state.

**Tech Stack:** Expo (latest SDK — pin via `expo install`), expo-router, `@trpc/client` + `@trpc/react-query` v11 + `@tanstack/react-query` v5, `expo-secure-store`, `expo-localization` + i18next, `react-native-webview`, `@tanstack/react-query-persist-client` + AsyncStorage, `jest-expo` + `@testing-library/react-native`. Type-only: `@docjob/api`, `@trpc/server`. Runtime workspace dep: `@docjob/types`.

## Global Constraints

- **RN bundle boundary is non-negotiable (the #1 risk):** `apps/mobile` may import `import type { AppRouter } from '@docjob/api'` and NOTHING ELSE from `@docjob/api`; it MUST NOT import `@docjob/core`, `@docjob/db`, or `@docjob/auth` at all (not even type-only). A value import of `@docjob/api`, or any import of core/db/auth, drags prisma's query engine + argon2's native addon + the openai SDK into Metro → build/runtime failure. Enforce with ESLint `no-restricted-imports` + a boundary test. Derive all `Serialized*`/`SearchHit` shapes from `inferRouterOutputs<AppRouter>`, never from `@docjob/core`.
- **No transformer:** the server `initTRPC` uses none — the mobile client MUST use a plain `httpBatchLink` with NO transformer (superjson would mismatch). Wire outputs are plain JSON (`Serialized*` flatten Dates to strings).
- **Auth transport:** send `Authorization: Bearer <accessJWT>` on every tRPC/API call; send NO cookie header and run NO cookie jar (a cookie forfeits the CSRF exemption); send NO custom Origin (native clients omit Origin — required for the SP-4a auth endpoints to return tokens in the body and to pass CSRF). Auth lifecycle (`login`/`refresh`/`logout`/`me`) uses the dedicated `/api/auth/*` routes (SP-4a returns tokens in the JSON body for native clients); `users.register` is tRPC (public).
- **Single-flight refresh is a correctness requirement, not an optimization:** one in-flight refresh promise shared across all callers; on 401 await it then retry the original request exactly once; persist the rotated refresh token atomically (SecureStore mutex) and discard the old one before retrying; on refresh failure clear tokens + route to login. Parallel refreshes trigger family reuse-detection → forced logout everywhere.
- **Roles on the wire are UPPERCASE** (`'ADMIN' | 'DOCTOR' | 'REVIEWER'`). Most data procedures require an *approved* actor (core `assertApproved`); an unapproved logged-in user is a distinct app state (only `users.me`/`updateProfile`/logout work).
- **Brand "DocJob"** everywhere, all locales; never "MEDIZO". UI copy predominantly Russian; taxonomy labels (Russian) come from a mobile copy of the taxonomy (do NOT import the web `@/lib/case-taxonomy`).
- **Green per task:** `pnpm --filter mobile typecheck` + `pnpm --filter mobile test` (jest-expo) + `pnpm --filter mobile lint` (incl. the boundary rule). No device/simulator is available in CI — do NOT add tasks that require one; verification is typecheck + jest-expo + component tests.
- **Reference:** the exhaustive API/auth/screens map is `docs/superpowers/specs/2026-07-16-sp4-mobile-build-brief.md` §B — consult it for procedure names, tiers, and per-screen data calls.

## API contract quick-reference (from the SP-4 understand map — derive types via inference, don't hardcode)

- **Auth (NOT tRPC):** `POST /api/auth/login {email,password,deviceLabel?}` → (native) body `{user, access, refresh, refreshExpiresAt}`; 401 `{status:'pending'|'invalid'}`, 429 `{status:'locked',retryAfterSeconds}`. `POST /api/auth/refresh {refresh}` → `{user, access, refresh, refreshExpiresAt}`. `POST /api/auth/logout {refresh}` → `{ok:true}`. `GET /api/auth/me` (Bearer) → `{user}|{user:null}`.
- **tRPC (Bearer):** `users.register`(public), `users.me`/`users.updateProfile`(protected); `search.search {query}`(protected, 30/60s → `TOO_MANY_REQUESTS`); `cases.list`/`listPaged`/`byId`(protected, `byId` carries `bodyHtml`); `reviews.forCase`/`mine`(protected), `reviews.create`(reviewer), `reviews.delete`(protected, author-or-admin); `saved.toggle`/`isSaved`/`list`/`ids`(protected); `submissions.create`/`sendMessage`/`mine`/`byId`(protected); `news.list`(public); `announcements.active`(public, actor-aware)/`dismiss`(protected); `banners.get`(public); `tags.list`(protected); `users.requestPasswordReset`/`resetPassword`/`checkResetToken`(public). Bare-`z.string()` id inputs (pass the id directly): `cases.byId`, `reviews.forCase`, `saved.*`, `submissions.byId`, `announcements.dismiss`. **Do NOT call** admin-tier procs (`news.byId`, `announcements.list/byId`, all `*.create/update/delete` admin ones, `users.list/pending/approve/...`).

---

### Task 1: Scaffold `apps/mobile` + the type-only boundary (feasibility gate)

**Goal:** a minimal Expo + expo-router app that installs, typechecks, runs one jest-expo test, and mechanically enforces the RN-bundle boundary. This is the go/no-go for the environment.

**Files:** `apps/mobile/` (Expo project), `apps/mobile/package.json`, `apps/mobile/tsconfig.json`, `apps/mobile/metro.config.js`, `apps/mobile/babel.config.js`, `apps/mobile/app.json`, `apps/mobile/.eslintrc.js` (or `eslint.config.js`), `apps/mobile/app/_layout.tsx` + `apps/mobile/app/index.tsx` (trivial), `apps/mobile/jest.config.js` + `apps/mobile/jest-setup.ts`, `apps/mobile/src/__tests__/boundary.test.ts`, `apps/mobile/src/lib/api-types.ts`.

- [ ] **Step 1: Scaffold.** From `apps/`, create the app: `pnpm dlx create-expo-app@latest mobile --template blank-typescript` (or the expo-router template `--template tabs`). Then pin compatible deps with `cd apps/mobile && npx expo install expo-router expo-secure-store expo-localization react-native-webview @react-native-async-storage/async-storage`. Add JS deps: `pnpm --filter mobile add @trpc/client @trpc/react-query @tanstack/react-query @tanstack/react-query-persist-client zod i18next react-i18next`. Add type-only + dev: `pnpm --filter mobile add -D @docjob/api@workspace:* @trpc/server jest-expo jest @testing-library/react-native @types/jest eslint`. Add runtime workspace dep: `pnpm --filter mobile add @docjob/types@workspace:*`. **Do NOT add** `@docjob/core`/`@docjob/db`/`@docjob/auth`.
  - If `create-expo-app` can't run offline/in this env, hand-author the minimal Expo project structure instead (package.json with `expo`, `react`, `react-native`, `expo-router`, the `main: "expo-router/entry"`, app.json, babel.config with `babel-preset-expo`) and `pnpm install`. Report which path you took.

- [ ] **Step 2: Monorepo Metro + tsconfig + babel.**
  - `metro.config.js`: extend `expo/metro-config`, set `config.watchFolders = [workspaceRoot]` and `config.resolver.nodeModulesPaths = [path.join(projectRoot,'node_modules'), path.join(workspaceRoot,'node_modules')]` (standard Expo-monorepo config for pnpm symlinks).
  - `babel.config.js`: `presets: ['babel-preset-expo']` (this elides `import type` — the mechanism that keeps `@docjob/api` out of the bundle).
  - `tsconfig.json`: `{ "extends": "expo/tsconfig.base", "compilerOptions": { "strict": true, "paths": { "@/*": ["./src/*"] } }, "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"] }`. Do NOT extend the repo-root `tsconfig.base.json`.
  - `package.json` scripts: `"dev": "expo start"`, `"typecheck": "tsc --noEmit"`, `"lint": "eslint .", "test": "jest"`, `"android": "expo run:android"`, `"ios": "expo run:ios"`.

- [ ] **Step 3: The type-only AppRouter surface.** `apps/mobile/src/lib/api-types.ts`:

```ts
import type { AppRouter } from '@docjob/api';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

// Convenience aliases (derived, NOT imported from @docjob/core):
export type SerializedCase = RouterOutputs['cases']['byId'];
export type CaseListItem = RouterOutputs['cases']['listPaged']['items'][number];
export type SearchHit = RouterOutputs['search']['search'][number];
export type SerializedReview = RouterOutputs['reviews']['forCase'][number];
export type SerializedSubmission = RouterOutputs['submissions']['mine'][number];
export type SerializedUser = NonNullable<RouterOutputs['users']['me']>;
export type SerializedNewsItem = RouterOutputs['news']['list'][number];
export type SerializedAnnouncement = RouterOutputs['announcements']['active'][number];
```

(Adjust the exact index paths if inference disagrees — let `tsc` guide you; the point is these resolve WITHOUT importing `@docjob/core`.) Re-export a `type AppRouter` too if convenient.

- [ ] **Step 4: ESLint boundary rule.** In the mobile ESLint config add:

```js
rules: {
  'no-restricted-imports': ['error', {
    paths: [
      { name: '@docjob/core', message: 'Server-only; would poison the RN bundle. Derive types via inferRouterOutputs<AppRouter>.' },
      { name: '@docjob/db', message: 'Server-only; never import in mobile.' },
      { name: '@docjob/auth', message: 'Server-only; never import in mobile.' },
    ],
    patterns: [
      { group: ['@docjob/core/*','@docjob/db/*','@docjob/auth/*'], message: 'Server-only; never import in mobile.' },
    ],
  }],
}
```

(A value import of `@docjob/api` is caught by the boundary test in Step 5 — ESLint's `no-restricted-imports` can't easily distinguish type vs value, so the test does it.)

- [ ] **Step 5: Boundary test** `apps/mobile/src/__tests__/boundary.test.ts` — greps every `apps/mobile/src` + `apps/mobile/app` `.ts`/`.tsx` file and asserts: (a) no import from `@docjob/core`/`@docjob/db`/`@docjob/auth`; (b) every import of `@docjob/api` is `import type` (matches `/^import\s+type\b/` for that specifier). Mirror the pattern of `packages/api/src/boundary.test.ts` (read it). This is the mechanical guard that a value import can never slip in.

```ts
import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function walk(dir: string): string[] { /* recurse, collect .ts/.tsx */ }

describe('RN bundle boundary', () => {
  const files = [...walk(join(__dirname, '..')), ...walk(join(__dirname, '../../app'))];
  it('never imports @docjob/core|db|auth', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toMatch(/from ['"]@docjob\/(core|db|auth)['"]/);
    }
  });
  it('imports @docjob/api only as a type', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      const lines = src.split('\n').filter((l) => /from ['"]@docjob\/api['"]/.test(l));
      for (const l of lines) expect(l).toMatch(/^\s*import\s+type\b/);
    }
  });
});
```

- [ ] **Step 6: jest-expo setup + a trivial passing test.** `jest.config.js`: `{ preset: 'jest-expo', setupFilesAfterEnv: ['<rootDir>/jest-setup.ts'] }` (+ `transformIgnorePatterns` per Expo docs so RN/Expo modules transform). Add a trivial component/unit test (e.g. render `app/index.tsx` or assert `1+1===2`) so the suite has a green baseline alongside the boundary test.

- [ ] **Step 7: Gate + commit.** `pnpm --filter mobile install` (already done), `pnpm --filter mobile typecheck`, `pnpm --filter mobile test`, `pnpm --filter mobile lint`. Also confirm the workspace didn't break the rest: `pnpm typecheck` (root). If Expo install pulled a version that conflicts, resolve via `expo install --fix`. Report jest-expo feasibility explicitly (this is the go/no-go).

```bash
git add apps/mobile pnpm-lock.yaml
git commit -m "feat(sp4b): scaffold Expo app + type-only @docjob/api boundary (ESLint + boundary test)"
```

---

### Task 2: API client core — tRPC client, Bearer transport, single-flight refresh, SecureStore token store

**Goal:** the fully unit-tested networking core. This is the most correctness-critical, most testable part — no UI.

**Files:** `apps/mobile/src/lib/config.ts` (API base URL from `expo-constants`/env), `apps/mobile/src/lib/token-store.ts` (+ test), `apps/mobile/src/lib/auth-client.ts` (login/refresh/logout/me + single-flight `authFetch`) (+ test), `apps/mobile/src/lib/trpc.ts` (`createTRPCReact<AppRouter>` + `httpBatchLink` using `authFetch`).

**Interfaces:**
- `TokenStore`: `getAccess()`, `getRefresh()`, `setTokens({access,refresh,refreshExpiresAt})`, `clear()` — all async, backed by `expo-secure-store`, serialized through an in-memory mutex (the refresh token is single-use — never read-rotate-write concurrently).
- `authFetch(input, init): Promise<Response>` — attaches `Authorization: Bearer <access>`; on 401 runs single-flight `refresh()`; retries once; on refresh failure clears tokens + signals logout.
- `login(email,password,deviceLabel?)`, `refresh()`, `logout()`, `fetchMe()` — hit `/api/auth/*`, persist tokens via `TokenStore`.

- [ ] **Step 1: Config.** `config.ts` exposes `API_BASE_URL` (from `expo-constants` `extra`/`process.env.EXPO_PUBLIC_API_URL`, default `http://localhost:3000` for dev). All `/api/...` calls prefix it.

- [ ] **Step 2: TokenStore (TDD).** Write `token-store.test.ts` first (mock `expo-secure-store` with an in-memory map): setTokens then getAccess/getRefresh returns them; clear() empties; concurrent `setTokens` calls serialize (no interleave) via the mutex. Implement `token-store.ts` (keys `docjob.accessToken`/`docjob.refreshToken`/`docjob.refreshExpiresAt`, `keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY` on the refresh key). Green.

- [ ] **Step 3: Single-flight authFetch (TDD — the critical test).** Write `auth-client.test.ts` first (mock global `fetch` + the TokenStore):
  - `authFetch` attaches `Authorization: Bearer <access>`.
  - **Concurrent 401s trigger exactly ONE refresh:** fire 3 `authFetch` calls whose first response is 401; assert the refresh endpoint `fetch` was called exactly once (shared in-flight promise), all 3 retried after it, and the rotated tokens persisted once.
  - On a successful refresh, the original request is retried exactly once with the NEW access token.
  - On refresh failure (401 from `/refresh`), tokens are cleared and a logout signal fires; the original request is not retried again.
  - The rotated refresh token is persisted BEFORE any retry (atomic).
  Implement `auth-client.ts`: module-scoped `refreshInFlight: Promise<boolean> | null`; `refresh()` posts `{ refresh: await store.getRefresh() }` to `/api/auth/refresh`, on `res.ok` persists `{access,refresh,refreshExpiresAt}` from the body, `.finally` clears `refreshInFlight`, resolves `res.ok`, `.catch(()=>false)`. `authFetch` mirrors the web `apps/web/src/lib/auth-client.ts` algorithm exactly (read it). `login`/`logout`/`fetchMe` per the auth contract. Expose an `onLogout` callback/emitter the session provider subscribes to. Green.

- [ ] **Step 4: tRPC client.** `trpc.ts`: `export const trpc = createTRPCReact<AppRouter>();` and a `makeTRPCClient()` returning `trpc.createClient({ links: [httpBatchLink({ url: `${API_BASE_URL}/api/trpc`, fetch: authFetch })] })` — **no transformer**. Type-only `import type { AppRouter } from '@docjob/api'`.

- [ ] **Step 5: Gate + commit.** typecheck + test (the single-flight test is the centerpiece) + lint + boundary test.

```bash
git commit -am "feat(sp4b): tRPC client + Bearer authFetch (single-flight refresh) + SecureStore token store"
```

---

### Task 3: Session provider + navigation shell (expo-router)

**Files:** `apps/mobile/src/providers/session.tsx` (+ test), `apps/mobile/src/providers/app-providers.tsx` (QueryClient + trpc.Provider + SessionProvider + i18n placeholder), `apps/mobile/app/_layout.tsx` (root, mounts providers + routes by session state), `apps/mobile/app/(auth)/{login,register,pending}.tsx`, `apps/mobile/app/(tabs)/_layout.tsx` (Tab navigator, 5 tabs), placeholder tab screens.

**Interfaces:**
- `useSession(): { user: SerializedUser | null; status: 'loading'|'unauthenticated'|'pending'|'authenticated'; login(...); logout(); refetch() }`. `status==='pending'` when `user && !user.approvedAt`. Gate ALL UI on `status !== 'loading'` (the `isInitialized` analog).

- [ ] **Step 1: SessionProvider (TDD).** On mount, `fetchMe()` (Bearer) → set user/status; subscribe to `authFetch`'s `onLogout` to clear on refresh-failure. `login()` calls `auth-client.login` then `fetchMe`. `logout()` calls `auth-client.logout` + clears. Test (mock auth-client): loading→authenticated on valid me; loading→unauthenticated on null me; approvedAt:null → `'pending'`; onLogout → unauthenticated.
- [ ] **Step 2: Providers + root layout.** `app-providers.tsx` nests `QueryClientProvider` → `trpc.Provider` (client from Task 2) → `SessionProvider`. `app/_layout.tsx` renders `<AppProviders>` + an expo-router `Stack`/`Slot` that shows `(auth)` when unauthenticated/pending and `(tabs)` when authenticated — gate on `status`.
- [ ] **Step 3: Auth screens.** `login.tsx` (email/password → `useSession().login`; show pending/invalid/locked errors from the 401/429 bodies), `register.tsx` (`trpc.users.register.useMutation` → on success route to `pending`), `pending.tsx` (waiting-for-approval message + logout). Component tests: login form submits; pending screen shows for `approvedAt:null`.
- [ ] **Step 4: Tab navigator shell.** `(tabs)/_layout.tsx` — 5 `Tabs.Screen`: Search 🔍, Cases, Saved, Submissions, Profile (lucide/expo icons; Russian labels via i18n keys, placeholder strings OK until Task 6). Placeholder screen bodies (filled in T4/T5). Component test: authenticated session renders the tab bar; unapproved does not.
- [ ] **Step 5: Gate + commit.** `feat(sp4b): session provider + expo-router auth stack + tab shell + approval gate`.

---

### Task 4: Search + Cases (list + subgroup picker) + Case detail

**Files:** `apps/mobile/src/lib/taxonomy.ts` (mobile copy of the 4 subgroups + Russian labels — do NOT import web `@/lib/case-taxonomy`), `app/(tabs)/search.tsx`, `app/(tabs)/cases/index.tsx` (subgroup picker), `app/(tabs)/cases/[subgroup].tsx` (list), `app/case/[id].tsx` (detail), `src/components/{search-result-card,case-card,case-body-webview,reviews-panel,save-button}.tsx`.

- [ ] **Step 1: Search tab.** `trpc.search.search.useQuery({ query }, { enabled: submitted })` on submit/debounce; render `SearchHit[]` (case name/teaser, matched-via badges 'semantic'/'lexical', snippet — the snippet is server HTML with `<mark>`; render as plain text on mobile OR via a tiny inline formatter, NOT a webview); handle `TOO_MANY_REQUESTS` with a Russian backoff message; zero-result + initial states. Tapping a hit routes to `/case/<id>`.
- [ ] **Step 2: Cases tab.** Subgroup picker (static taxonomy) → `[subgroup].tsx` calls `trpc.cases.listPaged.useInfiniteQuery` (or `list`) filtered by subgroup; case cards route to detail.
- [ ] **Step 3: Case detail.** `trpc.cases.byId.useQuery(id)` → render `bodyHtml` in `react-native-webview` (`source={{ html: wrapHtml(case.bodyHtml) }}` with a dark-theme CSS wrapper + `originWhitelist`, `javaScriptEnabled={false}` for safety); reviews via `trpc.reviews.forCase.useQuery(id)`; `save-button` via `trpc.saved.isSaved` + `trpc.saved.toggle` (invalidate on toggle); **reviewer-gated** review-compose (`trpc.reviews.create.useMutation`) shown only when `useSession().user.role` is `ADMIN`/`REVIEWER` (doctors read-only); `reviews.delete` for own reviews.
- [ ] **Step 4: Tests + gate.** Component tests: search renders hits + badges + zero-result; case detail renders webview with `bodyHtml`; reviewer sees compose, doctor doesn't; save toggle calls the mutation. `feat(sp4b): Search + Cases + Case detail (webview body, reviews, save, reviewer-gated compose)`.

---

### Task 5: Saved + Submissions + Profile + News + Announcements + Banners

**Files:** `app/(tabs)/saved.tsx`, `app/(tabs)/submissions/{index,[id]}.tsx` (+ create form + thread), `app/(tabs)/profile.tsx`, `app/news.tsx`, `app/reviewer/my-reviews.tsx`, `src/components/{announcement-modal,banner,submission-thread,contact-form}.tsx`.

- [ ] **Step 1: Saved tab.** `trpc.saved.list.useQuery` → cards → detail; unsave via `saved.toggle` (invalidate).
- [ ] **Step 2: Submissions.** `index` = `submissions.mine.useQuery` list + a create form (`submissions.create`); `[id]` = `submissions.byId` + a message thread (`submissions.sendMessage`, invalidate). Status badges from the submission status enum.
- [ ] **Step 3: Profile.** `users.me` + `users.updateProfile` (edit name/photo per `SerializedUser`); logout button (`useSession().logout`); language toggle (RU/KK — wired in Task 6, placeholder now); a News entry; a reviewer-only "My reviews" link → `reviewer/my-reviews.tsx` (`reviews.mine` + `reviews.delete`); optional Contact form (`trpc.contact.send` — now delivers via SP-4a).
- [ ] **Step 4: Announcement popup + banners.** On authenticated session ready, `trpc.announcements.active.useQuery` → dismissible modal → `announcements.dismiss(id)` (invalidate so it won't reappear). Render banner slots from `trpc.banners.get.useQuery` (`BannerManifest`). Mount the announcement host inside the session provider.
- [ ] **Step 5: News.** `news.list` (public) list screen, reachable from Profile (and could be pre-login).
- [ ] **Step 6: Tests + gate.** Component tests: saved list, submission create+thread, profile edit+logout, announcement dismiss flow, news list. `feat(sp4b): Saved + Submissions + Profile + News + Announcements + Banners`.

---

### Task 6: i18n (RU+KK) + offline persistence + EAS config + FINAL GATE

**Files:** `apps/mobile/src/i18n/{index.ts,ru.json,kk.json}`, wire `i18next`+`expo-localization` into `app-providers`, language toggle on Profile, `apps/mobile/src/lib/query-persist.ts`, `apps/mobile/app.json` (identifiers), `apps/mobile/eas.json`, `apps/mobile/README.md`.

- [ ] **Step 1: i18n.** i18next init with `ru` (default) + `kk` catalogs mirroring the web app's user-facing strings for the mobile screens (auth, tabs, case, reviews, submissions, profile, errors — pull key names/text from `apps/web/src/i18n/messages/{ru,kk}.json` for the overlapping surface; do NOT import them — copy the needed keys). `expo-localization` picks the initial language; Profile toggle persists the choice (SecureStore or AsyncStorage). Replace placeholder strings across screens with `t('...')`. Brand "DocJob" in both. Test: every key used in the app exists in BOTH `ru.json` and `kk.json` (a key-coverage test).
- [ ] **Step 2: Offline React Query persistence.** `query-persist.ts`: `@tanstack/react-query-persist-client` with an AsyncStorage persister; wrap the app in `PersistQueryClientProvider`; set sane `gcTime`/`staleTime` so Search/Cases/Saved/News read from cache offline. **Tokens are NOT in the RQ cache** (they live in SecureStore) — ensure the persister only holds query data. Test: the persister config excludes nothing sensitive (queries only).
- [ ] **Step 3: EAS + app config.** `app.json`: `name: "DocJob"`, `slug: "docjob"`, `ios.bundleIdentifier: "com.docjob.app"`, `android.package: "com.docjob.app"`, scheme `docjob` (for the eventual deep-link reset). `eas.json`: `build` profiles (development/preview/production) + `submit` placeholders. `README.md`: how to run on device (Expo Go / dev build), set `EXPO_PUBLIC_API_URL`, and the EAS build/submit steps that require the owner's Apple/Google/Expo accounts (call out what CANNOT be done without them).
- [ ] **Step 4: FINAL GATE.** `pnpm --filter mobile typecheck` + `pnpm --filter mobile test` (jest-expo, all component+unit+boundary+i18n tests) + `pnpm --filter mobile lint`; plus root `pnpm typecheck && pnpm test && pnpm build` to confirm the mobile package didn't break the monorepo. Document exactly what was verified here vs what needs a device/store account. `feat(sp4b): i18n RU+KK + offline persistence + EAS config; SP-4b final gate`.

---

## Self-Review

**Brief §B coverage:** B1 boundary+wiring (T1) · B2 tRPC/Bearer/single-flight/SecureStore (T2) · B3 shared types via inference (T1 api-types + used throughout) · B4 nav auth-stack+5-tabs (T3) · screens (T4/T5) · B5 providers (T3) · B6 i18n RU+KK (T6) · B7 offline persist (T6) · B8 tests (every task + T6 final). ✅

**No-device honesty:** every task gate is typecheck + jest-expo + lint — never a simulator. The "cannot verify" set (app-link resolution, Keychain semantics, webview fidelity, EAS build/submit, on-device offline) is documented in T6 README, not silently claimed.

**Boundary safety:** T1 establishes the type-only `@docjob/api` import + ESLint + boundary test; every later task obeys it and the boundary test runs in each gate. Types come from `inferRouterOutputs`, never `@docjob/core`.

**Type consistency:** `RouterOutputs`/`RouterInputs` (T1) feed every screen's data types; `authFetch` (T2) is the single fetch used by both the tRPC client (T2) and the auth calls; `useSession().status` (T3) gates all UI and is read by T3/T4/T5.

## Risks
- **Expo/RN version churn:** pin everything via `expo install`/`expo install --fix` so the SDK/RN/React versions are mutually compatible; if `create-expo-app` won't run in this env, hand-author the minimal project (T1 Step 1 fallback).
- **jest-expo in a pnpm monorepo:** may need `transformIgnorePatterns` tuning + `moduleNameMapper` for `@docjob/types`/`@/*`. If jest-expo can't run here at all, fall back to a plain `ts-jest`/`vitest` config for the PURE logic tests (token store, single-flight, i18n coverage, boundary) — those don't need the RN renderer — and mark component tests as device-deferred. Report which.
- **`inferRouterOutputs` resolving through `@docjob/api`:** requires `prisma generate` to have run (turbo pulls `@docjob/db db:generate` into mobile's typecheck graph via the devDep) — if types don't resolve, run `pnpm --filter @docjob/db db:generate` first.
- **webview + bodyHtml:** render with `javaScriptEnabled={false}` + a strict `originWhitelist` + the SP-4a-sanitized HTML; the body is already XSS-escaped server-side, but keep JS disabled in the webview as defense-in-depth.
- **Single-flight refresh** is the one piece that MUST be correct — its test (concurrent 401s → one refresh) is the centerpiece of T2; do not weaken it.
