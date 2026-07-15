# SP-4 BUILD BRIEF — DocJob Mobile (Expo) + Backend Prep

Synthesized from API_SURFACE, AUTH_CONTRACT, WEB_SCREENS, BACKEND_GAPS, SHARED_TYPES_WIRING. Two phases: **SP-4a backend prep must land and be green before SP-4b mobile work starts.** Every SP-4a task is fully testable in-repo (no device, no store account). All four backend gaps are confirmed by direct code inspection.

Cross-cutting architecture principle carried through this whole brief: `@docjob/core` and `@docjob/api` forbid importing `@/lib` (enforced by `boundary.test.ts` in both packages, and `packages/core` also forbids importing `react`). Two of the four backend gaps (contact email, reset link) are the *same* architectural problem — delivery/link logic was stranded in the web Server Action layer — and share one fix: an injected `EmailSender` port + pure templates/builders moved into core, with the web tRPC mount supplying the Resend adapter via `ApiContext`.

---

## (A) BACKEND PREP — SP-4a

These four must land first. None require React Native; all are unit/integration-testable in the existing web+packages test setup.

### A1 — Server-side BlockNote-JSON → HTML body render

**Problem.** Mobile renders the case body in a `react-native-webview` as HTML. The only BlockNote renderer in the repo is browser-only React (`case-body-viewer-inner.tsx` → `useCreateBlockNote` + `<BlockNoteView editable={false}>`, loaded `ssr:false`). It cannot run server-side or in RN. `serializeCase` (`packages/core/src/cases/case.mapper.ts:81-125`) returns `body` as raw BlockNote JSON (`CaseBody`). The only server-safe transforms today are *plain-text* flatteners (`apps/web/src/lib/case-body-text.ts` — `caseBodyToPlainText`/`caseBodyPreview`, and a private copy in `packages/core/src/search/embeddings.ts:45-85`).

**Do NOT** pull in `@blocknote/server-util` — it depends on `react`/`prosemirror` and would break `packages/core/src/boundary.test.ts` (react-free boundary). `@blocknote/*` is declared only in `apps/web/package.json`; keep it that way.

**Interface / files.**
- New pure module `packages/core/src/cases/case-body-html.ts` exporting `caseBodyToHtml(body: CaseBody): string`. A recursive JSON→HTML walker parallel to the existing plain-text walker. Handle the block types the library actually emits: `paragraph`, `heading`, `bulletListItem`, `numberedListItem`, `image`, `table`; render inline marks (bold, italic, link). **HTML-escape all inline text.** Map `image` blocks to their `/api/images/<file>` or `/api/attachments/<file>` URL.
- Expose the result as a new `bodyHtml: string` field computed inside `serializeCase` (`case.mapper.ts`) — keep the existing JSON `body` for the web editor/viewer. (Alternative: a dedicated `cases.bodyHtml` query. Recommend the mapper field so `cases.byId` and `cases.list`/`listPaged` all carry it and mobile needs no extra round-trip; `RouterOutputs['cases']['byId']` then inference-carries `bodyHtml` to the client for free.)

**Test.** Pure unit test in `packages/core`: fixture JSON (heading, paragraph with bold+link marks, nested bullet/numbered lists, an image block, and a `<script>` payload in text) → assert the exact HTML string (escaping + tag mapping, zero I/O). Add an assertion in `packages/api/src/routers/cases.test.ts` that the `cases.byId` serialized payload includes `bodyHtml`.

### A2 — Contact email delivery into core (contact.send currently drops the message)

**Problem.** `contact.send` (`packages/api/src/routers/contact.ts:49-58`) calls `core.contact.parseContactMessage` (pure validation + honeypot, `packages/core/src/contact/contact.service.ts`) and returns `{ sent: true }` **without sending anything**. Real delivery lives only in the web Server Action `sendContactMessage` (`apps/web/src/app/actions.ts:268-293` → `@/lib/email` `buildContactEmail`+`sendEmail`, Resend). Mobile has no Server Action path, so every mobile contact submission is silently discarded.

**Interface / files.**
- New port `packages/core/src/shared/email-port.ts`: `interface EmailSender { send(msg): Promise<void> }`.
- Move the pure templates `buildContactEmail` and `buildPasswordResetEmail` **into core** (transport-agnostic; no `resend`/`@/lib` import).
- New `core.contact.sendContactMessage(input, deps: { email: EmailSender })`: validate via `parseContactMessage`, **no-op on honeypot** (`company` field set), else build + `deps.email.send`.
- Thread the port through the API: add `email: EmailSender` to `ApiContext` (`packages/api/src/context.ts`). The web mount (`apps/web/src/app/api/trpc/[trpc]/route.ts`) injects a thin adapter wrapping the existing `@/lib/email` `sendEmail` (Resend). `contact.send` then calls `core.contact.sendContactMessage(input, { email: ctx.email })` and actually delivers.
- Keep `@/lib/email` (or a small infra package) as the only place importing `resend`.

**Test.** Unit-test `core.contact.sendContactMessage` with a spy `EmailSender`: `send()` called once with the built subject/body for a valid message; **not called** when honeypot `company` is set. Integration: drive `contact.send` through the in-process tRPC server caller with a spy sender in context. Local end-to-end needs no credentials — `@/lib/email` falls back to `console.log` when `RESEND_API_KEY` is absent (`email.ts:19-27`).

### A3 — Password-reset link env + tRPC procedures (currently web-Server-Action-only, web-origin base)

**Problem.** `resetBaseUrl()` (`apps/web/src/app/actions.ts:203-205`) reads `process.env.AUTH_URL` (also the CSRF key — not free to repurpose) and builds `${base}/reset-password?token=...`, a web route. `core.users.requestPasswordReset` only issues the token (returns `rawToken`); URL-building + `sendEmail` happen in the Server Action (`actions.ts:212-231`). The tRPC users router (`packages/api/src/routers/users.ts`) has **no** `requestPasswordReset`/`resetPassword`/`checkResetToken` procedures at all — mobile cannot start a reset over tRPC.

**Interface / files.**
- New env `PASSWORD_RESET_URL_BASE` (a.k.a. `APP_LINK_BASE`) — do **not** overload `AUTH_URL`.
- New core pure builder `buildResetLink(base, token): string` (same injected-base pattern as the email port), so the existing Server Action and a new tRPC procedure emit an identical link.
- Add `requestPasswordReset` / `resetPassword` / `checkResetToken` to `packages/api/src/routers/users.ts`, using the injected `EmailSender` (from A2) + configured base. Keep env reading in the web mount, not in core.
- Link strategy (recommended default): a universal/app-link at `${base}/reset-password?token=` that resolves into the installed app (Android App Links / iOS Universal Links) and falls back to the web form — one link serves both. Custom-scheme `docjob://reset-password?token=` is the simpler fallback behind the same env.

**Test.** Pure unit test `buildResetLink(base, token)` → exact URL (web-origin case and deep-link case). Locally, with no `RESEND_API_KEY`, trigger `requestPasswordReset` and read the URL from the dev console fallback; assert it points at the configured base + reset path. App-link *resolution* is a client-config concern tested separately.

### A4 — Attachment route Bearer access (`/api/attachments/[filename]` is cookie-only)

**Problem.** `apps/web/src/app/api/attachments/[filename]/route.ts:12` calls `requireUser()` → `getCurrentUser()` (`apps/web/src/lib/session.ts:18-28`) which reads **only** the access cookie via `cookies()`/`getAccessToken` and ignores its `req` argument. Mobile sends `Authorization: Bearer <jwt>` and no cookie → every attachment fetch 401s. (The tRPC context `packages/api/src/context.ts:23-56` `extractToken` already does Bearer-first-then-cookie; this file route just never adopted it. `/api/images/[filename]` is public, so inline images are unaffected. The admin upload routes `/api/attachments/upload` + `/api/images/upload` share the cookie-only limit but are out of scope for mobile v1.)

**Interface / files.**
- New shared web helper `getUserFromRequest(req): Promise<User | null>` in `apps/web/src/lib/session.ts` (or a new `request-auth.ts`): try Bearer header, else access cookie; verify with `verificationKeys()` (`apps/web/src/lib/auth-keys.ts`); re-read the User row — mirroring `packages/api/src/context.ts`.
- Have the attachments `GET` pass its already-received `req` into it. Stays entirely in the web/auth-infra layer; core is not involved. Optionally factor the cookie/bearer parse so web and `@docjob/api` share one impl.

**Test.** Unit-test `getUserFromRequest`: crafted `Request` with `Authorization: Bearer <access jwt from @docjob/auth test helpers>` → seeded user; cookie-only `Request` → same user; no token → null. Route-level: `GET` with Bearer + seeded attachment → 200 + bytes; without token → 401. Repro: `curl -H "Authorization: Bearer <token>" localhost:3000/api/attachments/<file>` 401s today, 200s after.

### A5 — Mobile-transport auth endpoints (the one gap that blocks a pure-Bearer client)

The tRPC context is *already* Bearer-ready. But **the auth endpoints are cookie-transport only**, and this is the single hard blocker for a native client. The `@docjob/auth` service layer already returns raw tokens (`login() → { access, refresh, refreshExpiresAt, user }`; `rotateRefresh() → { newRaw, expiresAt, userId, familyId }`), so this is thin route work — **no changes to token signing/verification, rotation, or CSRF.**

- **`POST /api/auth/login`** — currently writes access+refresh only as httpOnly `Set-Cookie` (`setAuthCookies`); body is just `{ user }`. Add: return `{ access, refresh, refreshExpiresAt }` in the JSON body. Forward an optional `deviceLabel` (e.g. `"ios-<deviceId>"`) into `login()` for per-device refresh-family tracking / revoke-per-device (`issueRefreshFamily` accepts it). Preserve existing responses: `401 {status:'pending'}`, `401 {status:'invalid'}` (deliberately indistinguishable), `429 {status:'locked', retryAfterSeconds}`.
- **`POST /api/auth/refresh`** — currently reads refresh token **only** from the `__Secure-docjob-refresh`/`docjob-refresh` cookie (`getRefreshToken(req.cookies)`). Add: accept the refresh token from request body/header, and return the rotated `{ access, refresh, refreshExpiresAt }` (`rotateRefresh`'s `{ newRaw, expiresAt }`) in the body so mobile can persist it.
- **`POST /api/auth/logout`** — accept the presented refresh token (body/header) so its family is revoked server-side, then the client deletes local tokens.
- **`GET /api/auth/me`** — currently `getAccessToken(req.cookies)` only. Add Bearer-header reading (reuse the context's `bearerToken` parser).

**Test.** Route tests asserting login/refresh JSON bodies now carry raw tokens; refresh accepts a body token and rotates; `/api/auth/me` resolves identity from a Bearer header; logout revokes the family. **Security invariants to assert:** single-use refresh (a second presentation of a rotated token triggers `revokeFamily('reuse-detected')`); `deviceLabel` is persisted on the family.

> Note the CSRF exemption contract (`apps/web/src/lib/csrf.ts`): the same-origin guard short-circuits to pass **only when** `Authorization: Bearer` is present AND **no `cookie` header** is present. So these mobile variants must not depend on cookies, and the mobile HTTP client must not run a cookie jar (see B2).

---

## (B) MOBILE APP — SP-4b (`apps/mobile`, Expo)

### B1 — Workspace wiring (the type-only boundary is non-negotiable)

**Bundle-poisoning is the top blocking risk.** `@docjob/api`'s single entrypoint (`packages/api/src/index.ts`) exports the `appRouter` **value** next to the `AppRouter` type; `appRouter` → each router → `import * as core from '@docjob/core'` → `@docjob/db` (prisma query engine), `@docjob/auth` (argon2 native `.node`, jose), and the `openai` SDK. None of these can bundle for RN. A single accidental **value** import from `@docjob/api` — or *any* import from `@docjob/core`/`@docjob/db`/`@docjob/auth` — drags the whole server stack in.

- `pnpm-workspace.yaml` — **no edit needed** (already globs `apps/*`). Create `apps/mobile/` with `package.json name: "mobile"` (or `@docjob/mobile`).
- `apps/mobile/package.json`:
  - **dependencies (runtime-safe):** `@docjob/types: workspace:*`, plus `expo`, `react-native`, `@trpc/client`, `@tanstack/react-query`, `zod`, `expo-router`, `expo-secure-store`, `expo-localization`, `react-native-webview`, i18n lib, React Query persistence deps.
  - **devDependencies (type-only):** `@docjob/api: workspace:*` and `@trpc/server: ^11` — devDeps precisely because consumed type-only; keeps server-only transitive deps out of the production closure.
  - **Do NOT list** `@docjob/core`, `@docjob/db`, `@docjob/auth`.
- **The only safe consumption:** `import type { AppRouter } from '@docjob/api'`. Babel (`babel-preset-expo` → `@babel/preset-typescript`) elides `import type` before Metro resolves, so the server runtime is never walked. The `type` keyword must be **explicit** — a bare `import { AppRouter }` is not guaranteed to be elided.
- **Never import `Serialized*` from `@docjob/core`** (even type-only — its barrel is value-heavy and one slip is catastrophic). Derive all response/request shapes via inference (B3).
- `tsconfig` — Expo **owns** it: `extends: "expo/tsconfig.base"`, self-contained, `types: ["expo"]`. Do **not** extend root `tsconfig.base.json` (it sets `jsx: preserve`, `module: esnext` — wrong for RN). Turbo doesn't care about tsconfig inheritance.
- `metro.config.js` — monorepo config: `config.watchFolders = [workspaceRoot]`, `config.resolver.nodeModulesPaths = [<app>/node_modules, <root>/node_modules]` so `@docjob/types` resolves through pnpm symlinks. Babel: `babel-preset-expo`.
- `turbo.json` — no breaking edits. Do **not** define a `build` script in `apps/mobile` (EAS builds remotely; nothing local to cache). Add scripts `dev: "expo start"` (the existing `dev` task is `cache:false, persistent:true` — fans out cleanly), `typecheck: tsc --noEmit`, `lint: eslint`, `test: jest-expo`. Turbo will pull `@docjob/db db:generate` into mobile's typecheck/test graph via the `@docjob/api` devDep (harmless and correct — tsc needs `@docjob/api` types which transitively reference generated Prisma types).

**Guardrails (make the boundary enforced, not aspirational):**
- ESLint `no-restricted-imports` in `apps/mobile`: forbid `@docjob/core`/`@docjob/db`/`@docjob/auth` outright; forbid non-`type` imports of `@docjob/api`.
- A small boundary test (mirroring `packages/api/src/boundary.test.ts`) that greps `apps/mobile/src` for a value import of `@docjob/api`.
- Optional hardening: add a `@docjob/api` subpath export `"./router-type"` → a file doing only `export type { AppRouter } from './root'`; mobile imports from that (zero runtime exports at the touched entrypoint).

### B2 — tRPC + React Query client (Bearer + single-flight refresh + expo-secure-store)

- Client: `createTRPCReact<AppRouter>()` with a single `httpBatchLink({ url: '<host>/api/trpc', fetch: authFetch })`. **No transformer** — `initTRPC` is created with none (wire is plain JSON; `Serialized*` mappers already flatten Dates to strings). A mobile client MUST NOT configure superjson or types mismatch. Match the web mount: batching on, GET for queries + POST for mutations, endpoint `/api/trpc`.
- **Auth transport:** attach `Authorization: Bearer <accessJWT>` on every request; **send no cookie header**, and **do not run a cookie jar** (replaying `Set-Cookie` forfeits the CSRF exemption — see A5 note). Bearer-only ⇒ CSRF-exempt, so no Origin/Referer needed.
- **Token storage (`expo-secure-store`, Keychain/Keystore — never AsyncStorage):** keys `docjob.accessToken`, `docjob.refreshToken`, optionally `docjob.refreshExpiresAt`. Refresh token is long-lived (60 days) ⇒ `keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Access JWT (~15m) may also live in memory.
- **Single-flight refresh (replicate `apps/web/src/lib/auth-client.ts` exactly — this is a correctness requirement, not an optimization):**
  1. Module-scoped shared `refreshInFlight: Promise<boolean> | null`.
  2. `refreshAccessToken()`: if null, start ONE `POST /api/auth/refresh` and store the promise; concurrent callers await the same promise; `.finally` clears it; resolves to `res.ok`, `.catch(()=>false)`.
  3. `authFetch(input, init)`: issue once; if `status !== 401` return it; on 401 await `refreshAccessToken()`; if false → clear tokens + route to login screen and return the original 401; if true → retry the original request **exactly once** (no second refresh loop).
  - **Why mandatory:** the raw refresh token is single-use with family-wide reuse detection (`refresh.service.ts::rotateRefresh`). Parallel refreshes: only the first rotation succeeds; the rest present an already-rotated token → `revokeFamily('reuse-detected')` force-logs-out every session. A 10s grace window (`DEFAULT_GRACE_SECONDS`) exists but must not be relied upon.
  - Add a **mutex** around the SecureStore read/rotate/write (the token is single-use): **atomically persist the NEW rotated refresh token and discard the old one before any retry.** Never retry more than once; never trigger a second refresh from within a retry.
- **Auth lifecycle calls are NOT tRPC.** Call the dedicated routes directly: `POST /api/auth/login|refresh|logout`, `GET /api/auth/me`. `users.register` **is** tRPC (public) and creates an unapproved user (`approvedAt: null`).
- **Error mapping (client reading):** standard tRPC error shape. `UNAUTHORIZED` → re-auth/refresh (note: from a tier guard it carries **no message**; from a core `UnauthorizedError` it carries a user-safe message); `FORBIDDEN` → insufficient role; `NOT_FOUND`; `BAD_REQUEST` → validation/domain rejection (`z.custom<…>(isPlainObject)` inputs do only a cheap object check at the wire — real field validation is server-side, so the client gets `BAD_REQUEST`, not zod field errors); `CONFLICT` → duplicate; `TOO_MANY_REQUESTS` → backoff (search only).
- **Bare-`z.string()` inputs** (pass the id directly, not wrapped): `cases.byId/delete/deleteAttachment`, `reviews.forCase/delete`, `saved.*`, `tags.add`, `submissions.byId`, `users.approve/reject/delete`, `news.byId/delete`, `announcements.dismiss/byId/delete`.

### B3 — Shared types

- `import type { AppRouter } from '@docjob/api'`; then `type RouterOutputs = inferRouterOutputs<AppRouter>` and `type RouterInputs = inferRouterInputs<AppRouter>` (from `@trpc/server`, type-only). Because each router returns core's value unchanged, inferred outputs **are** the `Serialized*` shapes: `RouterOutputs['cases']['byId'] == SerializedCase` (now incl. `bodyHtml` from A1); `RouterOutputs['cases']['listPaged'] == CasesPage`/`SerializedCaseListItem[]`; `RouterOutputs['search']['search'] == SearchHit[]` (`{ case: SerializedCase, score, matchedVia, snippet }`); plus `SerializedReview`, `SerializedSubmission`, `SerializedUser`, `SerializedNewsItem`, `SerializedAnnouncement` — all without importing `@docjob/core`.
- Runtime values from `@docjob/types` (RN-safe, only `zod`): `caseModeSchema`, `CASE_MODES`, `caseBodySchema`, `structuredCaseDraftSchema`, `EMPTY_BODY`, `CASE_MODE_BY_SUBGROUP`, types `CaseMode`, `CaseBody`, `StructuredCaseDraft`, `Result<T>`. Use for client-side form validation and the BlockNote body shape.
- **Role enum on the wire is UPPERCASE:** `'ADMIN' | 'DOCTOR' | 'REVIEWER'`. (Web normalizes to lowercase for legacy callers; mobile has no such legacy — keep uppercase or normalize consistently in the session layer.)

### B4 — Navigation (expo-router: auth stack + 5 tabs)

Session states drive the shell:
- **Logged out** → auth stack: **Login** (`POST /api/auth/login` + `GET /api/auth/me`), **Register** (`users.register`, then land on a *pending-approval* gate). Forgot/Reset password screens are **optional v1** — default to web hand-off (see C).
- **Logged in but unapproved** (`approvedAt: null`) → a distinct **pending-approval** screen; only `users.me`, `users.updateProfile`, and logout are usable. This is a first-class state, separate from logged-out.
- **Logged in + approved** → tab bar. The web role-branched dashboard (`page.tsx`) has **no mobile equivalent** — fold its role branching into tab/section visibility.

**The 5 tabs:**
1. **Search** (primary) — `search.search` (protected, approved actor). Query, rate-limited 30/60s → handle `TOO_MANY_REQUESTS` with backoff + a Russian retry-after message from the server. Results are `SearchHit[]`; tapping a hit pushes Case detail.
2. **Cases** — landing = subgroup picker (static taxonomy from `case-taxonomy.ts`, Russian labels) → list (`cases.list`/`cases.listPaged`) → **Case detail** (pushed from Cases/Search/Saved): `cases.byId` rendering `bodyHtml` in `react-native-webview`; `reviews.forCase` list; `saved.isSaved` + `saved.toggle` bookmark button. **Reviewer-only compose UI** gated on role: `reviews.create` is `reviewerProcedure` (ADMIN/REVIEWER only) — doctors can read but not post; `reviews.delete` (protected; core enforces author-or-admin). Attachments/linked files fetched through `/api/attachments/<file>` with the Bearer header (A4); inline images via public `/api/images/<file>`.
3. **Saved** — `saved.list` (+ `saved.ids`, `saved.toggle`).
4. **My-submissions** (suggest-case) — `submissions.create`; thread via `submissions.mine`, `submissions.byId`, `submissions.sendMessage` (core does inline author-or-admin check). Admin triage stays web-only.
5. **Profile** — `users.me` + `users.updateProfile`; hosts logout, **language toggle** (RU/KK), **News** link (`news.list`, public — also reachable pre-login), and a reviewer-only **My reviews** sub-screen (`reviews.mine` + `reviews.delete`). Optional Contact/Support/Legal entries (low priority; `contact.send` available and now actually delivers via A2).

**Announcement popup + banners (mounted inside the session provider):** on session ready, call `announcements.active` (public but actor-aware — returns `[]` for null actor and filters out ones this user already dismissed) and render a dismissible modal; dismiss → `announcements.dismiss(<id>)` so it never reappears for that user. Render banner slots by reading `banners.get` (`BannerManifest`, slot → `BannerInfo|null`); `banners.set` is admin/web-only.

**Web-only / skip on mobile v1:** landing, add-doctor, new-case authoring, all `/admin/*` (cases, users, pending, news CRUD, announcements CRUD, banners config, case-submissions triage). Mobile consumes only the read/submitter side of news, announcements, banners, submissions.

**tRPC-tier gotchas for the client:** `news.byId` and `announcements.list`/`byId` are **admin-tier** (not public — `news.byId` diverges from a naive "public read"); mobile must not call them. `cases.create`/`update` return immediately (re-embedding is fire-and-forget server-side) — irrelevant to mobile v1 since authoring is skipped.

### B5 — Providers (mobile analog of web `app-providers.tsx`)

1. tRPC/React-Query client provider at the root, pointed at `/api/trpc`, Bearer auth (B2).
2. Auth/session provider (UserProvider analog) exposing `currentUser` + `isInitialized` + approval state, gating the tab bar. Reviewer capability is a role flag on the session, not a separate provider. Gate all UI on `isInitialized` before reading `currentUser`.
3. Announcement host mounted **inside** the session provider (needs the logged-in user before showing).
4. Tag + case data as React Query hooks (not global providers).

### B6 — i18n (RU + KK)

- Own i18n layer (i18next + `expo-localization`) mirroring the web RU+KK catalogs (web uses next-intl, catalogs via `/api/i18n/*`). Language toggle on Profile.
- Brand string is **always "DocJob", never "MEDIZO"**, in all locales. UI copy is predominantly Russian; taxonomy labels in `case-taxonomy.ts` are Russian.

### B7 — Offline React Query persistence

- Persist the React Query cache (e.g. `@tanstack/react-query-persist-client` + an AsyncStorage-backed persister — cache data is non-sensitive; **tokens stay in SecureStore only**, never in the RQ persister). Configure sensible `gcTime`/`staleTime` so Search/Cases/Saved/News read from cache offline and revalidate on reconnect.

### B8 — Tests (`jest-expo`)

- Unit: the single-flight refresh interceptor (concurrent 401s trigger exactly one refresh; rotated token persisted atomically before retry; failed refresh clears tokens + routes to login), SecureStore token store mutex, error-code → UX mapping, i18n key coverage RU/KK, inference-derived type usage compiles.
- Component: Case detail webview renders `bodyHtml`; reviewer-vs-doctor conditional review-compose; announcement modal dismiss flow; pending-approval gate; tab visibility by session state.
- Boundary test (B1 guardrail): no value import of `@docjob/api`, no import of core/db/auth in `apps/mobile/src`.

---

## (C) KEY RISKS + OPEN DECISIONS

### Key risks

1. **RN bundle poisoning (blocking).** Any value import from `@docjob/api`, or any import from `@docjob/core`/`@docjob/db`/`@docjob/auth`, drags prisma's query engine, argon2's native `.node` addon, and the openai SDK into Metro — fails resolution or crashes at runtime. Mitigation: type-only `import type { AppRouter }`, devDep placement, ESLint `no-restricted-imports`, boundary grep test, optional `./router-type` subpath. **Guard it in CI, not by convention.**
2. **Refresh-token family self-destruct.** Concurrent 401 refreshes without single-flight → reuse detection revokes the whole family and logs the user out everywhere. Single-flight promise + SecureStore mutex + atomic rotate-then-retry are mandatory. Don't rely on the 10s grace window.
3. **Cookie-jar leakage forfeits CSRF exemption.** If the mobile HTTP client replays `Set-Cookie`, it stops being Bearer-only and gets 403'd by the same-origin check. Ensure no cookie jar.
4. **A5 (mobile auth endpoints) blocks everything.** Data calls already work via Bearer, but without token-in-body login/refresh/logout the app can't obtain or rotate tokens. Land A5 before any B2 integration testing.
5. **Approval-gate state confusion.** Logged-in-but-unapproved must be a distinct screen state; treating it as logged-out or fully-approved breaks the flow. Most protected procedures require an *approved* actor (`assertApproved` in core), while `protectedProcedure` itself only checks non-null — so an unapproved user gets `UNAUTHORIZED`/domain errors on most calls except `users.me`/`updateProfile`.
6. **`contact.send` still no-ops until A2 ships.** Ship A2 before exposing the mobile contact form, or submissions silently vanish.
7. **BlockNote HTML fidelity.** The hand-written walker (A1) must cover every block/mark type the editor actually emits, or case bodies render incompletely in the webview. Drive test fixtures from real seeded/reference case bodies, not synthetic minimal ones.

### Open decisions (with recommended default)

- **Password-reset: deep-link vs web hand-off.** *Recommend web hand-off for v1* — defer Forgot/Reset screens on mobile, link out to the web `/reset-password`. Still land A3 (env `PASSWORD_RESET_URL_BASE` + core `buildResetLink` + tRPC `requestPasswordReset`/`resetPassword`/`checkResetToken`) so the base URL is decoupled from `AUTH_URL` and the procedures exist; adopt universal/app-links in a later pass. One link (`${base}/reset-password?token=`) that resolves into the app when installed and falls back to web is the eventual target; custom-scheme `docjob://reset-password?token=` is the simpler fallback.
- **Locales.** *Recommend RU + KK, RU as default* — matches product spec and the Russian taxonomy/UI copy. KK catalog can ship partially and fall back to RU keys.
- **Bundle id / app identifier.** *Recommend `com.docjob.app`* (or the org's reverse-DNS) — needs confirmation from whoever owns the Apple/Google developer accounts; drives universal-link/App-Links association files if deep-linking is later enabled. Flag as owner-input-required.
- **Package name.** *Recommend `mobile`* (simple) or `@docjob/mobile` (scoped-consistent). Either works; pick one and keep ESLint/boundary tests pointed at it.
- **`bodyHtml` delivery shape.** *Recommend the `serializeCase` field* over a separate `cases.bodyHtml` query — carries through `byId`/`list`/`listPaged` via inference, no extra round-trip.

### Cannot be verified without a device / store account

- App-link / universal-link **resolution** into the installed app (Android App Links / iOS Universal Links association) — client+OS config, not testable in-repo.
- `expo-secure-store` Keychain/Keystore behavior under lock/unlock, biometric, and `WHEN_UNLOCKED_THIS_DEVICE_ONLY` semantics — requires a real device.
- `react-native-webview` rendering fidelity of `bodyHtml` on iOS/Android engines.
- Push/notification, EAS build/submit, store review — need Apple/Google developer accounts.
- Real end-to-end offline persistence + reconnect revalidation on device.

Everything in **SP-4a (A1–A5)** and the pure logic of **SP-4b** (single-flight refresh, token store, error mapping, inference-typed client, i18n key coverage, boundary guards) **is** verifiable in-repo without a device — that is the testable surface the implementation plan should anchor its TDD tasks to.