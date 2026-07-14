# SP-1d: `@docjob/api` — tRPC API over core + auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the typed tRPC API (`@docjob/api`) that both web (SP-2, server-caller + React Query) and mobile (SP-4, bearer JWT) will consume: routers wrapping every `@docjob/core` domain namespace, a request context that resolves the `Actor` from a cookie (web) OR `Authorization: Bearer` (mobile) via `@docjob/auth`, procedures (public/protected/reviewer/admin), `DomainError → TRPCError` mapping, and the Next route handler at `/api/trpc/[trpc]`. This SP only BUILDS + mounts + tests the API — the web app keeps using Server Actions until SP-2.

**Architecture:** `@docjob/api` initializes tRPC, defines `createContext({ req, keys })` that reads the token off a **standard `Request`** (bearer header or access cookie — web-standard `Headers`, not Next's `cookies()`/`headers()`, so the package stays transport-agnostic in the boundary sense), verifies it with `@docjob/auth`'s `verifyAccessToken`, re-reads role/approvedAt from Postgres (authority source), and exposes `{ actor }`. Each router procedure calls `core.<domain>.<fn>(ctx.actor, input)`; a global error-mapping middleware turns thrown `DomainError`s into `TRPCError`s. `apps/web` mounts it via `fetchRequestHandler`.

**Tech Stack:** `@trpc/server` v11, zod, `@docjob/core`, `@docjob/auth`, `@docjob/db`, vitest. (`@trpc/client`/`@trpc/react-query` are added when web/mobile consume it — SP-2/SP-4.)

## Global Constraints

- **`@docjob/api` boundary:** may import `@docjob/core`, `@docjob/auth`, `@docjob/db`, `@docjob/types`, `@trpc/server`, `zod`, and use the **web-standard `Request`/`Headers`/`URL`** globals. It must NOT import `next`/`next-auth`/`react`/`server-only`/`@/`, nor call Next's `cookies()`/`headers()`/`revalidatePath`. Add a boundary guard test (copy `packages/core/src/boundary.test.ts`, but ALLOW reading `req.headers`/cookies off a standard Request — the forbidden thing is the `next/headers` `cookies()`/`headers()` functions, not the Headers API).
- **Actor resolution (context):** token precedence = `Authorization: Bearer <jwt>` first (mobile), else the access cookie (web, same cookie name as `apps/web/src/lib/auth-cookies.ts`). `verifyAccessToken(token, keys)` → if valid, `prisma.user.findUnique({where:{id: claims.sub}})` → `Actor {id, role, approvedAt}` (re-read = authority, matches `getActor`/`session.ts`). Invalid/missing → `actor: null`. The `keys` are passed IN from the web handler (built from `AUTH_SECRET`/`AUTH_SECRET_PREVIOUS`) so `@docjob/api` doesn't read env directly (or read them via `@docjob/config` — pick one, be consistent).
- **Procedures:** `publicProcedure` (actor may be null); `protectedProcedure` (throws `TRPCError UNAUTHORIZED` if `!actor`); `reviewerProcedure`/`adminProcedure` (throw `FORBIDDEN` unless role matches) — but the FINE-GRAINED auth still lives in the core service (`assertApproved`/`assertAdmin`/`assertReviewer`), so routers pass `ctx.actor` to core and let it throw; the procedure level is an early gate + documents intent. Do NOT duplicate/second-guess the core auth rules.
- **Error mapping (one middleware, applied to the base procedure):** wrap `next()` in try/catch; map `UnauthorizedError→UNAUTHORIZED`, `ForbiddenError→FORBIDDEN`, `NotFoundError→NOT_FOUND`, `ValidationError→BAD_REQUEST`, `ConflictError→CONFLICT`, other `DomainError→BAD_REQUEST` (carry `e.message`, which is user-safe), non-DomainError → rethrow (tRPC → INTERNAL_SERVER_ERROR, message hidden). Preserve the Russian user-facing messages.
- **Input validation:** every mutation/query with input uses `.input(zodSchema)`; reuse the zod schemas from `@docjob/types` / the core service input types where they exist (don't redefine shapes that already exist).
- **Behavior parity:** each procedure returns the SAME data a corresponding Server Action returns today (same `Serialized*` shapes) — this is a second consumption path over the same core, not a redesign.
- **Do NOT migrate the web app to tRPC** in this SP (that's SP-2). The Server Actions stay. Only ADD the tRPC api + mount it. App stays green.
- Brand "DocJob". `pnpm typecheck`/`pnpm build`/`pnpm test` (core 119 + auth 48 + web 18 + new api tests) green after every task.

## Router → core namespace map (11 domains)
`cases`→`core.cases` · `search`→`core.search` · `reviews`→`core.reviews` · `saved`→`core.saved` · `tags`→`core.tags` · `submissions`→`core.submissions` · `users`→`core.users` · `news`→`core.news` · `announcements`→`core.announcements` · `contact`→`core.contact` · `banners`→`core.banners`.

---

### Task 1: Scaffold `@docjob/api` — trpc init, context, procedures, error mapping [TDD]

**Files:** create `packages/api/{package.json,tsconfig.json,vitest.config.ts}`, `packages/api/src/{index.ts,trpc.ts,context.ts,root.ts,boundary.test.ts,trpc.test.ts}`. Add deps `@trpc/server@^11`, `@docjob/core|auth|db|types`, `zod`.

**Interfaces (Produces):**
```ts
// context.ts
export type ApiContext = { actor: Actor | null };
export async function createContext(opts: { req: Request; keys: SigningKey[] }): Promise<ApiContext>;
// trpc.ts
export const router; export const publicProcedure; export const protectedProcedure;
export const reviewerProcedure; export const adminProcedure; export const createCallerFactory;
// root.ts
export const appRouter; export type AppRouter = typeof appRouter;  // starts with a `health` route only
```
- [ ] **Step 1: Failing test** `trpc.test.ts`: build a caller with a fake context (`{actor: null}` and an approved admin actor); a trivial `health` public query returns `{ok:true}`; a `protectedProcedure`-based test route throws `TRPCError` code `UNAUTHORIZED` when actor is null; the error-mapping middleware turns a thrown `ForbiddenError` (from a test procedure) into a `TRPCError` with code `FORBIDDEN` and the original message. Also a `context.test.ts`: `createContext` with a `Request` carrying a valid `Authorization: Bearer <signed token>` (sign one with `@docjob/auth` + a test key + seed/create a user) resolves the actor via DB re-read; with a bad/no token → `actor:null`.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** `trpc.ts` (`initTRPC.context<ApiContext>().create()`, the 4 procedures built on a base procedure carrying the error-mapping middleware), `context.ts` (bearer-then-cookie extraction from `req.headers`, `verifyAccessToken`, DB re-read), `root.ts` (`appRouter` with a `health` route), package files, `boundary.test.ts`. `pnpm install`.
- [ ] **Step 4: Run → pass.** `pnpm typecheck` green.
- [ ] **Step 5: Commit** `feat(sp1d): scaffold @docjob/api (tRPC init, context, procedures, error mapping)`.

---

### Task 2: `cases` + `search` routers (core + hero) [TDD, DB]

**Files:** create `packages/api/src/routers/{cases,search}.ts` + tests; modify `root.ts` (merge them).

**Procedures (mirror the existing case/search server actions exactly):**
- `cases`: `list` (public? — matches current: approved user; use protected), `listPaged`, `byId`, `create` (admin), `update`, `delete`, `updateAttachment`, `deleteAttachment`, `structureFromMarkdown` (admin — `core.cases.structureCaseFromMarkdown`). Each calls `core.cases.<fn>(ctx.actor, input)`.
- `search`: `search` (protected) → `core.search.searchCases(ctx.actor, input.query)`.
- [ ] TDD via `createCaller` with an approved-admin actor context against the dev DB: `cases.byId(missing)` → `TRPCError NOT_FOUND`; `cases.create` as non-admin actor → `FORBIDDEN`; `cases.create` as admin persists + returns a `SerializedCase` (no `solution`); `cases.list` returns an array; `search.search('инфаркт')` returns an array (OpenAI may 429 → substring fallback; assert array). Clean up rows. Commit `feat(sp1d): cases + search tRPC routers`.

---

### Task 3: `reviews` + `saved` + `tags` routers [TDD, DB]
- [ ] Create `routers/{reviews,saved,tags}.ts` + tests; merge into `root.ts`. Procedures mirror the actions: `reviews.forCase|create|delete|mine`, `saved.toggle|isSaved|list|ids`, `tags.list|add`. Test: `reviews.create` as non-reviewer → FORBIDDEN; `saved.toggle` idempotent; `tags.add` dedups. Commit `feat(sp1d): reviews + saved + tags tRPC routers`.

---

### Task 4: `submissions` router [TDD, DB]
- [ ] Create `routers/submissions.ts` + test; merge. Procedures: `create`, `sendMessage`, `mine`, `all` (admin), `byId`, `updateStatus` (admin). Test: author reads own, non-author non-admin → FORBIDDEN; `updateStatus` requires admin. Commit `feat(sp1d): submissions tRPC router`.

---

### Task 5: `users` router [TDD, DB]
- [ ] Create `routers/users.ts` + test; merge. Procedures: `me` (protected → `core.users.getUserById(ctx.actor.id)`), `updateProfile`, `list` (admin), `pending` (admin), `approve`/`reject`/`delete` (admin), `register` (public → `core.users.registerUser`). NOTE: login/refresh/logout stay as the dedicated `/api/auth/*` routes from SP-1c (they set cookies — NOT tRPC procedures); the `users` router is for user CRUD/profile only. Test: `list` as non-admin → FORBIDDEN; `register` creates an unapproved user. Commit `feat(sp1d): users tRPC router`.

---

### Task 6: `news` + `announcements` + `contact` + `banners` routers [TDD, DB]
- [ ] Create `routers/{news,announcements,contact,banners}.ts` + tests; merge. Procedures mirror the actions (news CRUD admin + public read; announcements active/dismiss/CRUD; contact.send public; banners read/CRUD). For `contact.send`, mirror the action: core does validation/honeypot; email delivery — decide (the current action sends email in the web wrapper; the tRPC procedure can call a core contact service that returns "to send" and the procedure sends via a passed-in sender, OR keep contact email in the web layer and have the tRPC route just record/validate). Keep behavior identical; document the choice. Commit `feat(sp1d): news + announcements + contact + banners tRPC routers`.

---

### Task 7: Mount the Next route handler + final gate

**Files:** create `apps/web/src/app/api/trpc/[trpc]/route.ts`; create `apps/web/src/lib/trpc-keys.ts` (or reuse `auth-keys.ts` from SP-1c) for the `keys`.

- [ ] **Step 1:** implement `apps/web/src/app/api/trpc/[trpc]/route.ts` using `@trpc/server/adapters/fetch` `fetchRequestHandler`: `endpoint: '/api/trpc'`, `router: appRouter`, `createContext: ({ req }) => createContext({ req, keys: authKeys() })`. `export const runtime = 'nodejs'` (context does DB + jose; keep it Node). Export `GET` + `POST`.
- [ ] **Step 2:** add `/api/trpc/*` to the middleware handling — it must NOT be blanket-redirected: unauthenticated tRPC calls should reach the handler and return tRPC's own `UNAUTHORIZED` (JSON), not a 307 to /login. (SP-1c's middleware already returns 401 JSON for `/api/*` — confirm `/api/trpc` is covered and not in a redirect path.)
- [ ] **Step 3: FINAL GATE:** `pnpm typecheck` + `pnpm test` (core 119 + auth 48 + web 18 + all api router tests) + `pnpm build` green. Live smoke against the dev server: (a) login via `/api/auth/login` to get cookies; (b) `curl` a tRPC query, e.g. `GET /api/trpc/cases.list?input=%7B%7D` with the cookie → 200 + JSON `result.data`; (c) the same without the cookie → tRPC `UNAUTHORIZED` (not an HTML redirect); (d) a bearer-token call (sign a token or reuse the login access cookie value as a Bearer) → 200 (proves the mobile path). Show results. Stop the server.
- [ ] **Step 4: Commit** `feat(sp1d): mount /api/trpc route handler; SP-1d final gate`.

---

## Self-Review

**Spec coverage (§5d):** tRPC routers per domain (Tasks 2-6) · context resolves cookie|bearer + DB reread (Task 1) · procedures public/protected/reviewer/admin (Task 1) · DomainError→TRPCError (Task 1) · zod input validation (all) · mounted at `/api/trpc/[trpc]` (Task 7) · Node runtime (context needs DB/jose) · web NOT yet migrated (deferred to SP-2). ✅

**Placeholder scan:** Task 1 gives full interfaces; Tasks 2-6 name each procedure + its core call + the key auth test per router (the wrapping is mechanical once Task 1's pattern exists). The one genuine decision (contact email in tRPC vs web) is called out in Task 6 with both options + "keep behavior identical".

**Type consistency:** `ApiContext.actor: Actor` (from `@docjob/core`) threads through every procedure; `AppRouter` type is the client contract SP-2/SP-4 import; `SigningKey` from `@docjob/auth`; router returns match the `Serialized*` types core already produces.

## Risks
- **tRPC v11 API:** use the current v11 patterns (`initTRPC`, `.create()`, `createCallerFactory`, `fetchRequestHandler`). If v11 differs from memory, follow the installed version's types.
- **Context transport-agnosticism:** reading `req.headers` off a standard `Request` is allowed; do NOT reach for `next/headers`. The boundary test must permit `Headers`/cookie-string parsing but forbid `next`/`@/` imports.
- **Cookie name:** the context must read the SAME access-cookie name SP-1c's `auth-cookies.ts` sets (http-dev vs `__Host-`/`__Secure-` prod) — import/share that constant, don't hardcode a guess.
- **Double auth:** procedures early-reject unauthenticated, but the fine-grained approvedAt/role/ownership checks remain in core — don't reimplement them in routers (drift risk).
