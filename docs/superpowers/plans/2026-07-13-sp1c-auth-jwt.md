# SP-1c: `@docjob/auth` — JWT Access+Refresh Auth (replaces NextAuth) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the cookie-only NextAuth v5 setup with a unified JWT auth that works for both web (httpOnly cookie) and, later, mobile (bearer): a transport-agnostic `@docjob/auth` package issuing short-lived access + rotating refresh tokens (argon2id passwords, reuse-detection), a Node-runtime refresh transport, CSRF defense for the cookie path, per-request DB re-read of role/approvedAt, and folding the `checkLoginIssue` oracle into a rate-limited login. Closes the two §5c blockers (no web silent-refresh transport; CSRF lost when leaving NextAuth).

**Architecture:** `@docjob/auth` (jose + argon2, transport-agnostic like `@docjob/core`) owns token mint/verify/rotate + password hashing + the `RefreshToken` table (added in SP-1a). The web app keeps session-resolution in its own layer (`getActor`/middleware) but backed by our JWT instead of NextAuth. Access-JWT lives in an httpOnly `Secure` `SameSite=Lax` cookie (web) or `Authorization: Bearer` (mobile, exercised in SP-1d/SP-4). This SP delivers the auth primitives + the web cutover; tRPC wiring is SP-1d.

**Tech Stack:** `jose` (JWT sign/verify, Edge-compatible), `argon2` (password hashing), Prisma `RefreshToken`, Next.js middleware (Edge) + Node route handlers, zod, vitest.

## Global Constraints

- **`@docjob/auth` is transport-agnostic** (same rule + guard test as `@docjob/core`): no `next`/`next-auth`/`react`/`server-only`/`@/` imports, no `revalidatePath`/`cookies()`/`headers()`. It gets tokens/secrets passed in; Next-cookie plumbing stays in the web layer.
- **Access token: ~15 min**, signed with `jose` HS256 using `AUTH_SECRET`. Claims: `sub` (userId), `role`, `approvedAt` (ISO or null), `kid`. **Refresh token: ~60 days**, opaque random (not a JWT), stored HASHED in `RefreshToken.tokenHash` (SHA-256, never plaintext — mirror `password-reset-tokens`).
- **Rotation + reuse detection:** every refresh rotates the refresh token (mark old `revokedAt`+`rotatedToId`, issue new in same `familyId`). Reuse of an already-rotated token ⇒ revoke the whole `familyId`. **Server-side grace window** (~10s): accept the immediate parent once within the window without family-revoke (covers client double-fire).
- **Client single-flight refresh:** web + (later) mobile run at most one in-flight refresh; concurrent callers await it. (Web helper in this SP; mobile in SP-4.)
- **Authority source:** access-JWT signature/expiry is verified at the edge (middleware, no DB). **Role + approvedAt (+ future `disabledAt`) are re-read from the primary DB per request** in the server-side guard (`getActor`/`requireX`) — preserves today's immediate revocation. The refresh endpoint also re-reads `approvedAt` and revokes the token family on de-approval.
- **CSRF (cookie path only):** the refresh route + any cookie-authed mutation entry point enforce a strict `Origin`/`Referer` allowlist (the app's own origin from `AUTH_URL`); reject state-changing requests whose Origin isn't allowlisted. Bearer/mobile is exempt (not cookie-driven). `SameSite=Lax` is necessary but not sufficient.
- **Passwords: argon2id for ALL writes** (register, reset, admin-set). On login, if a stored hash is bcrypt (legacy), verify with bcrypt then **re-hash to argon2id** and persist. Keep the `approvedAt` sign-in gate.
- **Oracle fix:** delete the standalone public `checkLoginIssue`; fold "pending vs invalid" into the login result, revealed only AFTER the password verifies. Add IP+account rate-limiting/lockout on login and refresh, before argon2 runs.
- **Keyed secret:** verify access-JWTs against a key set (`kid → {current, previous}`) with `AUTH_SECRET` + optional `AUTH_SECRET_PREVIOUS`, so rotating the secret doesn't force a global logout.
- **Env:** `NEXTAUTH_SECRET`→`AUTH_SECRET` (+ `AUTH_SECRET_PREVIOUS?`), `NEXTAUTH_URL`→`AUTH_URL`. Keep `AUTH_TRUST_HOST`.
- **Behavior parity for users:** the web login/logout/session experience is unchanged from the user's POV (same `/login`, same redirect, same "pending approval" message, same role-gated UI). `use-user-store`'s public API (`currentUser`, `isInitialized`, `logout`, roles lowercased) stays stable for existing callers.
- Brand "DocJob". App green after every task (`pnpm typecheck` + `pnpm build` + `pnpm test`, core 119 + web).

## Cutover risk (read before starting)
Replacing NextAuth invalidates existing sessions (users re-login once). This is acceptable and expected; do the cutover in one SP so the app is never half-on-two-auth-systems. Keep `bcryptjs` for legacy verification during the migration window.

## Package structure

```
packages/auth/
├── package.json         # @docjob/auth; deps: jose, argon2, @docjob/db, @docjob/types, zod
├── tsconfig.json
└── src/
    ├── index.ts
    ├── boundary.test.ts        # same transport-agnostic guard as core
    ├── passwords.ts            # argon2id hash/verify + bcrypt-legacy verify + needsRehash
    ├── tokens.ts               # access-JWT mint/verify (jose, keyed), refresh mint (opaque) + hash
    ├── refresh.service.ts      # rotate/verify/reuse-detect against RefreshToken table (+ grace window)
    ├── login.service.ts        # authenticate(email,password) -> {status:'ok'|'pending'|'invalid', tokens?}
    └── rate-limit.ts           # IP+account attempt counter (in-memory now; Redis-ready interface)
```

---

### Task 1: `@docjob/auth` scaffold + `passwords` (argon2id) [TDD]

**Files:** create `packages/auth/{package.json,tsconfig.json,vitest.config.ts}`, `src/{index.ts,passwords.ts,passwords.test.ts,boundary.test.ts}`; modify `apps/web/package.json` (+ dep) — actually web doesn't import auth yet; add the dep when first used (Task 6). Modify `packages/core`? No — core stays; auth is peer.

**Interfaces (Produces):**
```ts
// passwords.ts
export async function hashPassword(plain: string): Promise<string>;          // argon2id
export async function verifyPassword(hash: string, plain: string): Promise<boolean>; // argon2 OR legacy bcrypt
export function needsRehash(hash: string): boolean;                          // true if hash is bcrypt (legacy)
```
- [ ] **Step 1: Failing test** `passwords.test.ts`: `hashPassword` returns an argon2id string (`$argon2id$`); `verifyPassword(hash, plain)` true for right / false for wrong; `verifyPassword` accepts a known bcrypt hash (compute one with bcryptjs in the test) and returns true; `needsRehash(bcryptHash)===true`, `needsRehash(argonHash)===false`.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** package files + `passwords.ts` (argon2id via `argon2`; `verifyPassword` detects `$2` bcrypt prefix → `bcryptjs.compare`, else `argon2.verify`; `needsRehash` = starts with `$2`). Add `bcryptjs` + `argon2` deps. `pnpm install`.
- [ ] **Step 4: Run → pass.** `boundary.test.ts` = copy `packages/core/src/boundary.test.ts` (guards auth too).
- [ ] **Step 5: Commit** `feat(sp1c): scaffold @docjob/auth with argon2id password hashing`.

---

### Task 2: `tokens` — access-JWT (keyed jose) + refresh mint/hash [TDD]

**Files:** create `src/tokens.ts`, `src/tokens.test.ts`; modify `src/index.ts`.

**Interfaces:**
```ts
export type AccessClaims = { sub: string; role: Role; approvedAt: string | null };
export async function signAccessToken(claims: AccessClaims, opts: { secret: string; kid: string; ttlSeconds?: number }): Promise<string>;
export async function verifyAccessToken(token: string, keys: { kid: string; secret: string }[]): Promise<AccessClaims | null>; // tries each key; null on invalid/expired
export function generateRefreshToken(): string;          // opaque, high-entropy (mirror generateResetToken)
export function hashRefreshToken(raw: string): string;   // sha256 (mirror hashResetToken)
```
- [ ] TDD: sign→verify round-trips claims; expired token → null; wrong secret → null; a token signed with the "previous" secret still verifies when that secret is in the key list (keyed rotation); refresh token is unique + its hash is stable. Implement with `jose` (HS256, `kid` header, `exp`). Commit `feat(sp1c): access-JWT (keyed) + refresh token mint/hash`.

---

### Task 3: `refresh.service` — rotation + reuse detection + grace window [TDD, DB]

**Files:** create `src/refresh.service.ts`, `src/refresh.service.test.ts`; modify `src/index.ts`.

**Interfaces:**
```ts
export async function issueRefreshFamily(userId: string, deviceLabel?: string): Promise<{ raw: string; expiresAt: Date; familyId: string }>;
export async function rotateRefresh(rawToken: string, opts?: { graceSeconds?: number }):
  Promise<{ userId: string; familyId: string; newRaw: string; expiresAt: Date } | { revoked: true } | null>;
// null = unknown/expired token; {revoked:true} = reuse detected, family revoked; else rotated.
export async function revokeFamily(familyId: string, reason: string): Promise<void>;
export async function revokeAllForUser(userId: string, reason: string): Promise<void>; // admin "log out everywhere"
```
- [ ] TDD (real dev Postgres, create→assert→cleanup): issue→rotate returns a new token and marks the old `revokedAt`+`rotatedToId`; rotating the SAME old token again (outside grace) returns `{revoked:true}` and the whole family is revoked; rotating within `graceSeconds` returns the already-minted child once (no revoke); `revokeAllForUser` revokes every active family. Implement against `RefreshToken` (fields from SP-1a: familyId, tokenHash, rotatedToId, revokedAt, revokeReason, expiresAt). Commit `feat(sp1c): refresh rotation + reuse detection + grace window`.

---

### Task 4: `login.service` + `rate-limit` — fold the oracle, throttle, argon2 rehash [TDD, DB]

**Files:** create `src/login.service.ts`, `src/rate-limit.ts`, tests; modify `src/index.ts`. Moves the auth logic out of `apps/web/src/lib/auth.ts`'s `authorize()` and `core.users.checkLoginIssue`.

**Interfaces:**
```ts
export type LoginResult =
  | { status: 'ok'; access: string; refresh: string; refreshExpiresAt: Date; user: { id: string; role: Role; approvedAt: Date | null } }
  | { status: 'pending' }      // credentials valid but not admin-approved
  | { status: 'invalid' }      // wrong email/password
  | { status: 'locked'; retryAfterSeconds: number };
export async function login(input: { email: string; password: string; ip: string; deviceLabel?: string },
  keys: { kid: string; secret: string }): Promise<LoginResult>;
```
- [ ] TDD (DB): valid+approved → `{status:'ok', access, refresh}` and the access token verifies; valid+unapproved → `{status:'pending'}` (revealed only after password verified); wrong password → `{status:'invalid'}`; after N failures for an IP/account → `{status:'locked'}` and argon2 is NOT run; a legacy bcrypt user logging in gets their hash re-hashed to argon2id (assert the stored hash changed to `$argon2id$`). `rate-limit.ts` = in-memory sliding-window keyed by ip+email, behind an interface so SP-5 can swap Redis. Implement `login` = rate-limit check → find user → verifyPassword → (rehash if needed) → approvedAt gate → mint access + issue refresh family. Commit `feat(sp1c): rate-limited login folds pending/invalid oracle; argon2 rehash`.

---

### Task 5: web refresh transport + CSRF (Node route + Edge middleware) 

**Files:** create `apps/web/src/app/api/auth/login/route.ts`, `apps/web/src/app/api/auth/refresh/route.ts`, `apps/web/src/app/api/auth/logout/route.ts`, `apps/web/src/lib/auth-cookies.ts` (set/clear the httpOnly cookies), `apps/web/src/lib/csrf.ts` (Origin/Referer allowlist from `AUTH_URL`); modify `apps/web/src/middleware.ts`.

**Interfaces (web-side, Node runtime):**
- `POST /api/auth/login` → CSRF-check → `auth.login(...)` → on `ok` Set-Cookie access (`__Host`-style, httpOnly, Secure, SameSite=Lax, ~15m) + refresh (httpOnly, Secure, SameSite=Lax, path=/api/auth, ~60d) → return `{ user }` or the pending/invalid/locked status (no tokens leaked to JS).
- `POST /api/auth/refresh` (Node runtime — reads refresh cookie, hits DB) → CSRF-check → `auth.rotateRefresh(...)` → re-read user role+approvedAt from DB; if de-approved, `revokeFamily` + 401; else Set-Cookie new access + rotated refresh → 200. On `{revoked}`/null → clear cookies + 401.
- `POST /api/auth/logout` → revoke the presented refresh family + clear cookies.
- `middleware.ts` (Edge): verify access-JWT via `auth.verifyAccessToken` (keyed, no DB). If missing/expired but a refresh cookie exists and the request is a navigation, 307 to a refresh bounce (or let the client 401-interceptor handle it — pick one and document). For `/api/*` unauthenticated, return **401 JSON** (not a 307 to /login) so future native/tRPC calls don't get HTML. Keep the public-path allowlist.

- [ ] **Step 1:** implement `csrf.ts` (allow same-origin / `AUTH_URL` Origin; reject otherwise for POST) + `auth-cookies.ts`. 
- [ ] **Step 2:** implement the 3 route handlers (Node runtime via `export const runtime = 'nodejs'` on refresh/login/logout since they touch DB/argon2).
- [ ] **Step 3:** rewrite `middleware.ts` to verify our access-JWT (drop the NextAuth middleware) and return 401 JSON for `/api/*`.
- [ ] **Step 4:** verify with an integration test or manual curl: login sets cookies; a request with a valid access cookie passes middleware; refresh rotates; logout clears. `pnpm build` must pass (middleware is Edge — ensure `@docjob/auth`'s `verifyAccessToken` is Edge-safe: jose is, argon2 is NOT — keep argon2 out of the Edge middleware path; only `verifyAccessToken` runs at the edge).
- [ ] **Step 5:** Commit `feat(sp1c): web login/refresh/logout routes + CSRF + JWT middleware`.

---

### Task 6: cut `getActor`/`session` over to the JWT; delete NextAuth; client session layer

**Files:** modify `apps/web/src/lib/session.ts` (`getCurrentUser`/`requireUser`/`requireAdmin` read our access cookie → verify → **re-read role+approvedAt from DB per request**), `apps/web/src/lib/action-helpers.ts` (`getActor` already central — point it at the new session), `apps/web/src/hooks/use-user-store.tsx` + `apps/web/src/components/app-providers.tsx` (replace `next-auth/react` `useSession`/`signIn`/`signOut` with: SSR-hydrated user + a `GET /api/auth/me` endpoint + `POST /api/auth/login|logout`; keep the public API `currentUser`/`isInitialized`/`logout`/lowercased-roles stable), `apps/web/src/app/login/page.tsx` + `register`/`forgot`/`reset` pages (call the new endpoints; preserve `callbackUrl`). Delete: `apps/web/src/lib/auth.ts`, `auth.config.ts`, `auth-handlers.ts`, `apps/web/src/app/api/auth/[...nextauth]/route.ts`, and the `next-auth`/`@auth/prisma-adapter` deps. Create `apps/web/src/app/api/auth/me/route.ts`.

- [ ] **Step 1:** create `GET /api/auth/me` (reads access cookie → verify → DB re-read → returns `SerializedUser | null`).
- [ ] **Step 2:** rewrite `session.ts` to use `verifyAccessToken` + a DB re-read (this is the per-request authority source). Add a client-side single-flight refresh helper (`apps/web/src/lib/auth-client.ts`) with a 401-interceptor for client fetches.
- [ ] **Step 3:** rewrite `use-user-store.tsx` + `app-providers.tsx` off `next-auth/react`; wire `login`/`logout` to the new routes; drop `checkLoginIssue` import (login result now carries pending/invalid). Preserve `isInitialized` loader contract + lowercased roles.
- [ ] **Step 4:** delete the NextAuth files + `checkLoginIssue` action + `core.users.checkLoginIssue`; remove `next-auth`/`@auth/prisma-adapter` from `apps/web/package.json`.
- [ ] **Step 5:** route password writes through argon2: `core.users.registerUser`/`resetPassword` call `auth.hashPassword` (core gains a dep on `@docjob/auth`, or auth is injected — keep the transport-agnostic direction: `core` may depend on `auth` since both are pure). Update those two core functions + their tests.
- [ ] **Step 6:** verify — `grep -rn "next-auth" apps/web/src` empty; `pnpm typecheck` + `pnpm build` + `pnpm test` (core + web) green; manual smoke: login as seeded admin, hit a protected page, logout. Commit `feat(sp1c): cut web over to @docjob/auth JWT; remove NextAuth`.

---

### Task 7: env rename + keyed-secret rotation + final gate

**Files:** modify `.env.example`, `docker-compose.yml`, `apps/web` env reads, `packages/config` env schema, `CLAUDE.md`/`DEPLOY.md`.

- [ ] Rename `NEXTAUTH_SECRET`→`AUTH_SECRET` (+ optional `AUTH_SECRET_PREVIOUS`), `NEXTAUTH_URL`→`AUTH_URL` across compose/env/config/docs; wire the keyed verify (`{kid:'current',secret:AUTH_SECRET}` + previous if set). Update `.env.local` guidance (user must set `AUTH_SECRET`). 
- [ ] **FINAL GATE:** `pnpm typecheck` + `pnpm test` (core 119 + web + new auth tests) + `pnpm build` green; boot smoke: login → protected route → refresh (wait/expire or force) → logout, all via the real dev server + Postgres. Commit `chore(sp1c): env AUTH_SECRET/AUTH_URL + keyed rotation; final gate`.

---

## Self-Review

**Spec coverage (§5c):** argon2id all-writes + legacy rehash (T1,T4,T6) · access-JWT keyed (T2,T7) · refresh rotation+reuse+grace (T3) · rate-limited login folding the oracle (T4) · web refresh transport Node-route + Edge-middleware-verify (T5) · CSRF allowlist (T5) · per-request DB authority re-read + de-approval family revoke (T3,T5,T6) · client single-flight refresh (T5/T6) · NextAuth removal + client session layer replacement (T6) · env rename + keyed rotation (T7). Both §5c blockers (silent-refresh transport, CSRF) are T5. ✅

**Placeholder scan:** interfaces are concrete (signatures + claim shapes); the web-cutover tasks (T5/T6) reference exact files to create/modify/delete and name the endpoints — the token/session logic is fully specified in T1–T4. The one thing left to implementation is matching the existing `use-user-store` public API exactly, which T6 pins as a hard constraint (preserve `currentUser`/`isInitialized`/`logout`/lowercased roles).

**Type consistency:** `AccessClaims`/`LoginResult`/refresh-rotation return shapes are defined in T2–T4 and consumed by the routes (T5) + session (T6). `Role` from `@docjob/db`. Refresh fields match the SP-1a `RefreshToken` model.

## Risks
- **Edge runtime:** middleware runs on Edge — only `verifyAccessToken` (jose, Edge-safe) may run there; argon2 + Prisma (refresh/login) must be Node-runtime route handlers. T5 pins this.
- **Cutover:** all users re-login once (sessions invalidated). Communicate; keep bcrypt-legacy verify so existing passwords still work (rehashed on first login).
- **`__Host-`/`__Secure-` cookies require HTTPS** — in local dev (http) use non-prefixed names; prod (nginx TLS) uses the secure prefix. T5 must branch on env.
- **core→auth dependency (T6 Step 5):** `@docjob/core` gaining a dep on `@docjob/auth` is fine (both transport-agnostic); keep the dependency one-way (auth must not import core).
