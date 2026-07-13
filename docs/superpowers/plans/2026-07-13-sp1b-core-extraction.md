# SP-1b: `@docjob/core` Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Extract the transport-agnostic domain logic out of `apps/web/src/app/actions.ts` (2054 lines, ~50 actions) into a new `@docjob/core` package of per-domain services, and rewire each Server Action to a thin wrapper that (1) resolves the acting user, (2) calls the core service with an explicit `actor`, (3) does Next-only work (`revalidatePath`, cookies, file IO). Web behavior is unchanged; the same core services become the single source SP-1d's tRPC routers will call.

**Architecture:** `@docjob/core` depends only on `@docjob/db`, `@docjob/types`, `@docjob/config` and pure libs — NEVER on `next`, `next-auth`, React, `revalidatePath`, `cookies()`, or `headers()`. Services receive an explicit `actor: Actor | null` (the resolved user's id + role + approand) rather than reading the session. Authorization decisions live in core (given the actor); *obtaining* the actor stays in the web layer (`lib/session.ts`). Serialization (Prisma row → `Serialized*`) moves into core so both web and API return identical shapes.

**Tech Stack:** TypeScript, Prisma (`@docjob/db`), zod (`@docjob/types`), pnpm/Turborepo, vitest. No new runtime deps.

## Global Constraints

- **`@docjob/core` is transport-agnostic:** it must not import `next`, `next/*`, `next-auth`, `react`, `server-only`, `revalidatePath`, `cookies`, or `headers`. A CI grep enforces this (Task 9). OpenAI/Resend/Prisma/filesystem are allowed (they're infra, injected or imported directly).
- **Actor injection:** core service functions that need identity/authorization take an explicit first arg `actor: Actor` (or `actor: Actor | null` for public reads), where `type Actor = { id: string; role: Role; approvedAt: Date | null }`. Core NEVER calls `requireUser()`/`getSessionUser()`; the web wrapper resolves the actor and passes it in.
- **Behavior unchanged:** every existing action keeps its exact input/output contract (`ActionResult<T>`, same `Serialized*` shapes, same authorization rules, same error strings where they are user-visible). This is a refactor, not a redesign.
- **`revalidatePath`/cookies stay in the wrapper:** move the pure logic to core; keep the Next cache-invalidation and cookie/session/file-`FormData` handling in `actions.ts`.
- **Result type:** core services either return data and throw typed domain errors (`shared/errors.ts`), OR return the same `ActionResult<T>` — pick ONE and use it consistently. This plan uses **throw typed errors in core; the web wrapper catches and maps to `ActionResult`** (cleaner for tRPC later, which maps thrown errors to `TRPCError`). `shared/errors.ts` defines `DomainError` subclasses (`UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ValidationError`, `ConflictError`).
- **Don't extract dead legacy:** the Genkit actions `handleAnalyzeQuestion`, `handleGenerateScenario`, `handleSimulateComorbidities`, `handleFileUpload` and the flows `analyze-student-question`/`generate-personalized-scenario`/`patient-diagnosis-flow`/`simulate-comorbidities`/`genkit.ts`/`dev.ts` are dead (per CLAUDE.md) and OUT of scope — do NOT move them to core; leave them in `apps/web` untouched. (Their deletion is a separate user decision.)
- **Brand "DocJob".** App stays green (`pnpm typecheck` + `pnpm build` + `pnpm test`) after every task; the web app keeps working identically.

## `@docjob/core` structure (target)

```
packages/core/
├── package.json         # name "@docjob/core"; deps @docjob/db, @docjob/types, @docjob/config, openai, resend, zod, bcryptjs
├── tsconfig.json
└── src/
    ├── index.ts         # re-exports each domain's public API
    ├── shared/
    │   ├── errors.ts    # DomainError + subclasses
    │   ├── actor.ts     # Actor type + assertAdmin(actor)/assertApproved(actor) guards
    │   └── pagination.ts
    ├── cases/           # case.service.ts + case.mapper.ts (serializeCase) + case-import.service.ts (structureFromMarkdown)
    ├── search/          # search.service.ts (embeddings + pgvector) — reuses lib/embeddings logic
    ├── reviews/  submissions/  users/  news/  announcements/  tags/  banners/  saved/  contact/
    └── media/           # storage.ts wrapper (delegates to existing @/lib/storage for now; interface for SP-5 S3)
```

Domain→action mapping (which actions each service backs):
- **users**: registerUser, updateUser, getUsers, getPendingUsers, approveUser, rejectUser, deleteUser, checkLoginIssue, getSessionUser, requestPasswordReset, checkResetToken, resetPassword
- **cases**: createCase, updateCase, deleteCase, getCases, getCasesPaged, getCaseById, updateCaseAttachment, deleteCaseAttachment, handleStructureCaseFromMarkdown
- **search**: searchCases
- **tags**: getTags, addTag
- **news**: getNews, getNewsItem, createNews, updateNews, deleteNews
- **announcements**: getActiveAnnouncements, dismissAnnouncement, getAnnouncements, getAnnouncement, createAnnouncement, updateAnnouncement, deleteAnnouncement
- **saved**: toggleSavedCase, isCaseSaved, getSavedCases, getSavedCaseIds
- **reviews**: createReview, deleteReview, getReviewsForCase, getMyReviews
- **submissions**: createCaseSubmission, sendCaseSubmissionMessage, getMyCaseSubmissions, getAllCaseSubmissions, getCaseSubmissionById, updateCaseSubmissionStatus
- **contact**: sendContactMessage

---

### Task 1: Scaffold `@docjob/core` with `shared/` (errors, actor, pagination)

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`, `packages/core/src/shared/errors.ts`, `packages/core/src/shared/actor.ts`, `packages/core/src/shared/pagination.ts`
- Modify: `apps/web/package.json` (add `"@docjob/core": "workspace:*"`)

**Interfaces (Produces):**
```ts
// shared/errors.ts
export class DomainError extends Error { constructor(message: string); }
export class UnauthorizedError extends DomainError {}   // not logged in
export class ForbiddenError extends DomainError {}      // logged in, not allowed
export class NotFoundError extends DomainError {}
export class ValidationError extends DomainError {}
export class ConflictError extends DomainError {}
// shared/actor.ts
import type { Role } from '@docjob/db';
export type Actor = { id: string; role: Role; approvedAt: Date | null };
export function assertApproved(actor: Actor | null): Actor;   // throws UnauthorizedError/ForbiddenError
export function assertAdmin(actor: Actor | null): Actor;      // throws unless role==='ADMIN'
export function assertReviewer(actor: Actor | null): Actor;   // ADMIN or REVIEWER
```

- [ ] **Step 1: Write a failing test** `packages/core/src/shared/actor.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { assertAdmin, assertApproved } from './actor';
import { ForbiddenError, UnauthorizedError } from './errors';
describe('actor guards', () => {
  it('assertApproved throws UnauthorizedError for null', () => {
    expect(() => assertApproved(null)).toThrow(UnauthorizedError);
  });
  it('assertApproved throws ForbiddenError when approvedAt is null', () => {
    expect(() => assertApproved({ id: 'u', role: 'DOCTOR', approvedAt: null })).toThrow(ForbiddenError);
  });
  it('assertAdmin allows ADMIN', () => {
    const a = { id: 'u', role: 'ADMIN' as const, approvedAt: new Date() };
    expect(assertAdmin(a)).toBe(a);
  });
  it('assertAdmin throws ForbiddenError for DOCTOR', () => {
    expect(() => assertAdmin({ id: 'u', role: 'DOCTOR', approvedAt: new Date() })).toThrow(ForbiddenError);
  });
});
```
- [ ] **Step 2: Run it, verify it fails** — `pnpm --filter @docjob/core test` → FAIL (module not found).
- [ ] **Step 3: Implement** `errors.ts`, `actor.ts` (guards per the interface above; `assertApproved` throws `UnauthorizedError` if actor is null, `ForbiddenError` if `approvedAt` is null, else returns the actor), `pagination.ts` (a `CursorPage<T>` type + `encodeCursor`/`decodeCursor` helpers matching the current `getCasesPaged` cursor shape), and `package.json`/`tsconfig.json`/`index.ts`. Wire `apps/web` dep + `pnpm install`.
- [ ] **Step 4: Run tests + typecheck** — `pnpm --filter @docjob/core test` PASS; `pnpm typecheck` PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(sp1b): scaffold @docjob/core with shared errors + actor guards"`

---

### Task 2: Extract `cases` domain (service + mapper) and rewire its actions

The largest/central domain. Establishes the extraction PATTERN every later task follows.

**Files:**
- Create: `packages/core/src/cases/case.service.ts`, `packages/core/src/cases/case.mapper.ts`, `packages/core/src/cases/case.service.test.ts`
- Modify: `apps/web/src/app/actions.ts` (rewire createCase/updateCase/deleteCase/getCases/getCasesPaged/getCaseById/updateCaseAttachment/deleteCaseAttachment to call core), `packages/core/src/index.ts`

**Interfaces (Produces):**
```ts
// case.mapper.ts
export function serializeCase(row: CaseWithRelations): SerializedCase;  // moved verbatim from actions.ts
// case.service.ts — each takes actor where auth is needed; returns domain data or throws
export async function listCases(filters?: { subgroup?: string; specialty?: string }): Promise<SerializedCase[]>;
export async function listCasesPaged(input: {...}): Promise<CursorPage<SerializedCase>>;
export async function getCase(id: string): Promise<SerializedCase>;          // throws NotFoundError
export async function createCase(actor: Actor, input: CreateCaseInput): Promise<SerializedCase>;  // asserts admin
export async function updateCase(actor: Actor, input: UpdateCaseInput): Promise<SerializedCase>;
export async function deleteCase(actor: Actor, id: string): Promise<{ id: string }>;
export async function updateCaseAttachment(actor: Actor, ...): Promise<...>;
export async function deleteCaseAttachment(actor: Actor, id: string): Promise<{ id: string }>;
```
- Consumes: `Actor`, error classes (Task 1); `@docjob/db` (prisma), `SerializedCase`/`CaseInput` types from `@docjob/types` or `@/lib/case-schema` (move the shared zod/types to `@docjob/types` if convenient, else import from web — decide in Step 1 and keep consistent).

- [ ] **Step 1: Write failing service tests** `case.service.test.ts` against a **real test Postgres** (use the existing dev DB URL via `dotenv`, or a Testcontainer — match how vitest is configured; if no DB harness exists yet, this task ADDS one: a `vitest` setup that connects to `DATABASE_URL` and wraps each test in a transaction/rollback). Test at least: `getCase` throws `NotFoundError` for a missing id; `createCase` throws `ForbiddenError` for a non-admin actor; `createCase` as admin persists and returns a `SerializedCase` with no `solution`/`taskQuestions` field; `listCases` filters by subgroup.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `case.mapper.ts` (move `serializeCase` verbatim from actions.ts — it already drops solution/hasSolution post-SP-1a) and `case.service.ts` (move each action's BODY, replacing `requireAdmin()`/`requireUser()` calls with `assertAdmin(actor)`/`assertApproved(actor)` and the `ActionResult` returns with plain returns / thrown errors). Export from `index.ts`.
- [ ] **Step 4: Rewire the actions** in `actions.ts` — each becomes:
```ts
export async function createCase(input: CaseInput): Promise<ActionResult<SerializedCase>> {
  try {
    const actor = await getActor();               // helper: resolve session → Actor (Task 1 adds getActor in web)
    const data = await core.createCase(actor, input);
    revalidatePath('/admin/cases'); revalidatePath('/cases');
    return { success: true, data };
  } catch (e) { return toActionResult(e); }        // maps DomainError → { success:false, error }
}
```
  Add the small web-side helpers `getActor()` (wraps `getSessionUser`) and `toActionResult(e)` (maps `DomainError`→error string, unknown→generic) in a new `apps/web/src/lib/action-helpers.ts`.
- [ ] **Step 5: Verify** — `pnpm --filter @docjob/core test` PASS; `pnpm typecheck` PASS; `pnpm build` PASS; `pnpm test` (web) PASS. Manually confirm a case still creates/lists via the running app OR an integration test.
- [ ] **Step 6: Commit** — `git commit -m "feat(sp1b): extract cases domain to @docjob/core; actions become thin wrappers"`

---

### Task 3: Extract `users` domain (incl. auth-adjacent: register/approve/password-reset)

**Files:** Create `packages/core/src/users/user.service.ts` + `user.mapper.ts` + test; modify `actions.ts` (the 12 user/auth actions), `packages/core/src/index.ts`.

**Interfaces (Produces):** `serializeUser`, `registerUser(input)`, `updateUser(actor, input)`, `listUsers(actor)`, `listPendingUsers(actor)`, `approveUser(actor, id)`, `rejectUser(actor, id)`, `deleteUser(actor, id)`, `getUserById(id)`, `requestPasswordReset(email)`, `checkResetToken(token)`, `resetPassword(token, password)`. Password hashing (argon2id migration is SP-1c; **keep bcrypt here** unchanged — do not change hashing in SP-1b). `checkLoginIssue` stays a thin action for now (SP-1c folds it into login).

- [ ] Steps mirror Task 2 (failing test → implement → rewire → verify → commit). Key tests: `registerUser` sets `approvedAt=null` + hashes password; `approveUser` requires admin; `requestPasswordReset` is neutral/anti-enumeration (reuse `@/lib/password-reset-tokens` — move that logic into core/users or keep the lib and call it). Commit: `feat(sp1b): extract users/auth-adjacent domain to core`.

---

### Task 4: Extract `search` domain (embeddings + pgvector)

**Files:** Create `packages/core/src/search/search.service.ts` + test; move the embedding helpers from `@/lib/embeddings.ts` into `core/search` (or have core import the lib — decide, keep consistent); modify `actions.ts` (searchCases), `index.ts`.

**Interfaces (Produces):** `searchCases(query: string, filters?): Promise<SerializedCase[]>` — embeds the query via `@docjob/core`'s OpenAI client and runs the pgvector query. (Hybrid vector+lexical + `embeddingDirty` worker are SP-3, NOT here — SP-1b just relocates the CURRENT search logic unchanged.)

- [ ] Steps mirror Task 2. Test: `searchCases` returns cases ordered by similarity for a seeded query (integration, needs the dev DB with embeddings — if none, assert the query builds + executes without error and returns an array). Commit: `feat(sp1b): extract search domain to core`.

---

### Task 5: Extract `reviews` + `saved` + `tags` domains

Grouped — small, similar CRUD.

**Files:** Create `packages/core/src/{reviews,saved,tags}/*.service.ts` (+ mappers + tests); modify `actions.ts` (the 4 review + 4 saved + 2 tag actions), `index.ts`.

- [ ] Steps mirror Task 2, one commit per domain OR one grouped commit `feat(sp1b): extract reviews, saved, tags domains to core`. Key tests: `createReview` requires reviewer role (`assertReviewer`); `toggleSavedCase` is idempotent per `(userId,caseId)`; `getSavedCaseIds` returns the user's ids.

---

### Task 6: Extract `submissions` domain (+ message thread + status workflow)

**Files:** Create `packages/core/src/submissions/submission.service.ts` (+ mapper + test); modify `actions.ts` (the 6 submission actions), `index.ts`.

**Interfaces:** `createCaseSubmission(actor, input)`, `sendCaseSubmissionMessage(actor, id, body, attachments)`, `listMySubmissions(actor)`, `listAllSubmissions(actor)` (admin), `getSubmission(actor, id)` (author or admin), `updateSubmissionStatus(actor, id, status)` (admin).

- [ ] Steps mirror Task 2. Tests: author can read own submission, non-author non-admin gets `ForbiddenError`; `updateSubmissionStatus` requires admin; message append preserves order. Commit: `feat(sp1b): extract submissions domain to core`.

---

### Task 7: Extract `news` + `announcements` + `contact` + `banners` domains

**Files:** Create `packages/core/src/{news,announcements,contact,banners}/*.service.ts` (+ mappers + tests); modify `actions.ts` (news×5, announcements×7, contact×1), and for banners move the read side of `@/lib/banners-server.ts` logic into `core/banners` (keep the filesystem-manifest mechanism; core reads/writes the manifest through the media abstraction or directly — match current behavior). Modify `index.ts`.

- [ ] Steps mirror Task 2. Tests: `getActiveAnnouncements` filters by `active` + `expiresAt` and excludes ones the actor dismissed; `createNews` requires admin; `sendContactMessage` calls the email sender (mock `@/lib/email` or `core/email`). Commit: `feat(sp1b): extract news/announcements/contact/banners domains to core`.

---

### Task 8: Extract `case-import` (structureFromMarkdown) + `media` wrapper

**Files:** Create `packages/core/src/cases/case-import.service.ts` (moves `handleStructureCaseFromMarkdown`'s core + the `structure-case-from-markdown` flow call) and `packages/core/src/media/storage.ts` (a thin interface wrapping the existing `@/lib/storage` `saveAttachment`/`readAttachment` — the S3 swap is SP-5); modify `actions.ts` (handleStructureCaseFromMarkdown) + the file-serving/upload routes to go through the media interface where trivial (leave the route handlers themselves in web). Modify `index.ts`.

- [ ] Steps mirror Task 2. Test: `structureCaseFromMarkdown(actor, markdown, mode)` requires admin and returns a draft with no `solution`/`taskQuestions` fields (post-SP-1a shape). Commit: `feat(sp1b): extract case-import + media wrapper to core`.

---

### Task 9: Enforce boundary + final gate

**Files:** Create `packages/core/src/index.ts` final public surface; add a boundary check.

- [ ] **Step 1: Boundary grep** — `grep -rnE "from ['\"](next|next/|next-auth|react|server-only)['\"]|revalidatePath|cookies\(|headers\(" packages/core/src` → MUST be empty. If any hit, the leak must move back to the web wrapper. (Add this grep as a CI step / a test that fails on non-empty output.)
- [ ] **Step 2: `actions.ts` shrank to wrappers** — confirm `apps/web/src/app/actions.ts` no longer contains raw `prisma.` domain queries for the extracted domains (it delegates to `core.*`); the only `prisma` left is inside `getActor`/session plumbing if any. Grep `prisma\.` in actions.ts and confirm remaining hits are wrapper-plumbing only (or zero).
- [ ] **Step 3: FINAL GATE** — `pnpm --filter @docjob/core test` PASS (all domain tests), `pnpm typecheck` PASS, `pnpm build` PASS, `pnpm test` (web) PASS. Boot smoke: `pnpm --filter web dev`, `curl /login` 200, log in and exercise create-case + search + review + submission once (or rely on the core integration tests). Stop server.
- [ ] **Step 4: Commit** — `git commit -m "chore(sp1b): enforce core transport-agnostic boundary; final green gate"`

---

## Self-Review

**Spec coverage (spec §5a):** feature-sliced core services by domain (Tasks 2–8), Prisma-direct (no repository layer — YAGNI, per spec), media abstraction stub (Task 8, full S3 in SP-5), transport-agnostic boundary enforced (Task 9). Actor-injection replaces `requireUser`/`requireAdmin` so core is callable from both web wrappers and (SP-1d) tRPC. ✅

**Placeholder scan:** The per-domain tasks 3–8 intentionally say "steps mirror Task 2" and name the CONCRETE interfaces + tests for each domain rather than repeating the 6-step TDD skeleton verbatim — Task 2 is the fully-spelled reference pattern. Each task names its exact service functions, the actions it rewires, and its key test assertions. The one thing that cannot be pre-written is the moved logic itself (it's lifted from the current actions.ts bodies) — the plan says "move the action's body, swapping requireX() for assertX(actor) and ActionResult for return/throw", which is a mechanical, well-defined transform.

**Type consistency:** `Actor` (Task 1) is the first arg of every auth'd service (Tasks 2–8). `serializeCase`/`serializeUser`/etc. mappers produce the SAME `Serialized*` types the web already returns (moved verbatim). Core throws `DomainError` subclasses; the single `toActionResult` mapper (Task 2) turns them back into `ActionResult` for the web contract — so the web's external behavior is unchanged while SP-1d can instead map `DomainError`→`TRPCError`.

**Ordering safety:** shared scaffold (T1) → cases pattern (T2) → each domain independently (T3–T8, any order after T2) → boundary+gate (T9). App is green after each task because each rewires only its own actions and leaves the rest calling the old inline logic until their turn.

## Risks / notes
- **Test DB harness:** Task 2 may need to establish the integration-test setup (connect vitest to `DATABASE_URL`, transaction-rollback per test). If that proves heavy, the fallback is thinner unit tests with a mocked prisma — but prefer a real DB for the query-heavy services. Decide in Task 2 Step 1 and reuse for T3–T8.
- **`@/lib` shared code:** `case-schema`, `case-taxonomy`, `password-reset-tokens`, `embeddings`, `openai`, `email`, `storage` are imported by both the web and the soon-to-be core. Prefer MOVING the pure ones (`case-schema`, `case-taxonomy`, `openai`, `email`, `embeddings`) into `@docjob/core` (or `@docjob/types` for the pure zod) and re-exporting, so core doesn't depend on `apps/web`. Any `@/lib` that core needs but stays in web is a boundary violation — move it.
- **`getActor()` in web:** wraps `getSessionUser()` (`lib/session.ts`) → `Actor`. Session/auth resolution stays in web (SP-1c reworks it to JWT); core only ever receives the resolved `Actor`.
- Legacy Genkit actions/flows are left untouched (dead code, out of scope).
