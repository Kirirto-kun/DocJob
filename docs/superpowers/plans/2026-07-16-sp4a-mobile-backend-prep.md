# SP-4a: Mobile Backend Prep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 5 code-verified backend gaps that make `@docjob/api` fully consumable by a pure-Bearer native client, WITHOUT touching `@docjob/core`'s react-free / transport-agnostic boundary. This is the prerequisite that must land and merge before the Expo app (SP-4b) is built. Every task here is unit/integration-testable in-repo — no device, no store account, no OpenAI key.

**Architecture:** Two of the gaps (contact email, password-reset link) are the same architectural problem — delivery/link logic was stranded in the web Server Action layer because `@docjob/core` and `@docjob/api` forbid importing `@/lib` (enforced by `boundary.test.ts` in both). The shared fix is an injected **`EmailSender` port** + pure templates/link-builders moved into `core`, with the web tRPC mount supplying the Resend-backed adapter via `ApiContext`. The body-HTML gap is a pure JSON→HTML walker in core (NOT `@blocknote/server-util`, which pulls React). The attachment + auth-endpoint gaps are pure web/auth-infra work reusing the token extraction the tRPC context already does.

**Tech Stack:** `@docjob/core` (vitest, real Postgres via dotenv), `@docjob/api` (tRPC v11, vitest), `apps/web` (Next 15 route handlers, vitest), `@docjob/auth` (JWT/refresh test helpers). No new runtime deps.

## Global Constraints

- **App green after every task:** `pnpm typecheck` (all packages) + `pnpm test` (all packages) + `pnpm build` (apps/web).
- **Boundary discipline (enforced by tests):** `@docjob/core` must import NOTHING from `next`/`react`/`@/*`/`server-only` (`packages/core/src/boundary.test.ts`); `@docjob/api` must not import `@/lib` (`packages/api/src/boundary.test.ts`). New core code obeys both. Do NOT add `@blocknote/server-util` to core (it pulls `react`/`prosemirror`).
- **Actor model unchanged:** core functions take `Actor | null` first; the tRPC tiers (`public/protected/reviewer/admin`) and core's `assertApproved`/`assertAdmin` stay as-is.
- **No transformer on the wire:** `initTRPC` is created with NO transformer — outputs are plain JSON (`Serialized*` mappers already flatten Dates to strings). Do not add superjson.
- **Auth invariants must not regress:** access JWT stays HS256 ~15m with `kid` rotation; refresh stays single-use, rotating, family-reuse-detected with a 10s grace; login stays rate-limited with the pending/invalid timing-fold. A5 adds a transport (token-in-body / Bearer) WITHOUT changing signing, verification, rotation, or the CSRF model. The CSRF exemption requires Bearer-present AND cookie-absent — do not break it.
- **Brand "DocJob"** in any user-facing copy (email templates, etc.); never "MEDIZO".
- Dev Postgres is the docker `postgres` service on host port **5434** (already up; `docker compose --env-file .env.local up -d postgres` if not). `@/lib/email` `sendEmail` falls back to `console.log` when `RESEND_API_KEY` is absent — so email paths are locally testable with no credentials.

## Context: the exact API/auth surface (from the SP-4 understand workflow)

- tRPC context (`packages/api/src/context.ts`) ALREADY resolves `ctx.actor` from `Authorization: Bearer <jwt>` first, else the access cookie (`docjob-access`/`__Host-docjob-access`). Data calls already work for mobile.
- Auth lifecycle is NOT tRPC: `POST /api/auth/{login,refresh,logout}`, `GET /api/auth/me` (cookie-setting routes). `users.register` IS tRPC (public).
- `@docjob/auth` service layer already returns raw tokens: `login() → { access, refresh, refreshExpiresAt, user, status }`; `rotateRefresh() → { ok, userId, familyId, newRaw, expiresAt }`. The web routes today only write them to httpOnly cookies + return `{ user }`.
- `apps/web/src/lib/auth-keys.ts` `verificationKeys()` builds the key set from `AUTH_SECRET`(+`AUTH_SECRET_PREVIOUS`) — the same set the tRPC context + middleware use.

---

### Task 1 (A1): Server-side BlockNote-JSON → HTML (`caseBodyToHtml`) + `bodyHtml` on the serialized case

**Files:**
- Create: `packages/core/src/cases/case-body-html.ts`
- Create: `packages/core/src/cases/case-body-html.test.ts`
- Modify: `packages/core/src/cases/case.mapper.ts` (add `bodyHtml` to the full case serialization + its `Serialized*` type)
- Modify (test): `packages/api/src/routers/cases.test.ts` (assert `cases.byId` payload carries `bodyHtml`) — if that file doesn't exist, add a focused test file `packages/api/src/routers/cases.bodyhtml.test.ts` using the in-process caller.

**Interfaces:**
- Produces: `caseBodyToHtml(body: CaseBody | null | undefined): string` — pure, no I/O, no React. Deterministic HTML string.
- Produces: `SerializedCase` (and whatever the full-case mapper is named) gains a `bodyHtml: string` field.

**Design notes:**
- Mirror the existing plain-text walker (`packages/core/src/search/embeddings.ts` `caseBodyToPlainText`/`extractBlocks`/`blocksToText`/`inlineContentToText`) but emit HTML. Read that walker first to match the block/inline shape BlockNote actually produces in this repo.
- Handle block `type`s the editor emits: `paragraph` → `<p>`, `heading` (props.level 1-3) → `<h1..3>`, `bulletListItem` → `<li>` inside `<ul>`, `numberedListItem` → `<li>` inside `<ol>` (group consecutive same-type list items into one list), `checkListItem` → `<li>` (optionally a checkbox), `image` → `<img src="<escaped url>" alt="<escaped caption>">` (url from `block.props.url`), `table` → `<table>`/`<tr>`/`<td>`. Unknown block types → render their inline text inside a `<p>` (never drop content silently).
- Inline content: string → escaped text; array of inline items → each `{ type:'text', text, styles:{bold,italic,underline,strike,code} }` wrapped in `<strong>/<em>/<u>/<s>/<code>` per active styles; `{ type:'link', href, content }` → `<a href="<escaped>">...</a>`. Recurse into `children`.
- **HTML-escape ALL text and ALL attribute values** (`&`→`&amp;` first, then `<`→`&lt;`, `>`→`&gt;`, `"`→`&quot;`). This is the security-critical part: a case body containing `<script>` must render inert.
- Return an empty string for empty/absent body.

- [ ] **Step 1: Write the failing unit test** `case-body-html.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { caseBodyToHtml } from './case-body-html';

describe('caseBodyToHtml', () => {
  it('renders headings, paragraphs, and escapes text', () => {
    const body = { blocks: [
      { type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: 'Диагноз', styles: {} }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'a < b & c', styles: {} }] },
    ] };
    const html = caseBodyToHtml(body as any);
    expect(html).toContain('<h2>Диагноз</h2>');
    expect(html).toContain('a &lt; b &amp; c');
  });

  it('renders bold/italic/link inline marks', () => {
    const body = { blocks: [
      { type: 'paragraph', content: [
        { type: 'text', text: 'bold', styles: { bold: true } },
        { type: 'text', text: ' plain ', styles: {} },
        { type: 'link', href: 'https://x.test', content: [{ type: 'text', text: 'link', styles: {} }] },
      ] },
    ] };
    const html = caseBodyToHtml(body as any);
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<a href="https://x.test">link</a>');
  });

  it('groups consecutive list items into a single list', () => {
    const body = { blocks: [
      { type: 'bulletListItem', content: [{ type: 'text', text: 'one', styles: {} }] },
      { type: 'bulletListItem', content: [{ type: 'text', text: 'two', styles: {} }] },
    ] };
    const html = caseBodyToHtml(body as any);
    expect(html).toMatch(/<ul>\s*<li>one<\/li>\s*<li>two<\/li>\s*<\/ul>/);
  });

  it('neutralizes a script payload in text (no executable tag survives)', () => {
    const body = { blocks: [{ type: 'paragraph', content: [{ type: 'text', text: '<script>alert(1)</script>', styles: {} }] }] };
    const html = caseBodyToHtml(body as any);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes image url/alt attributes', () => {
    const body = { blocks: [{ type: 'image', props: { url: '/api/images/x.png"onerror="alert(1)', caption: 'a"b' } }] };
    const html = caseBodyToHtml(body as any);
    expect(html).not.toContain('onerror="alert');
    expect(html).toContain('&quot;');
  });

  it('returns empty string for empty/absent body', () => {
    expect(caseBodyToHtml({ blocks: [] } as any)).toBe('');
    expect(caseBodyToHtml(null)).toBe('');
    expect(caseBodyToHtml(undefined)).toBe('');
  });
});
```

- [ ] **Step 2: Run it → FAIL** (`Cannot find module './case-body-html'`).

Run: `pnpm --filter @docjob/core exec -- vitest run src/cases/case-body-html.test.ts`

- [ ] **Step 3: Implement `case-body-html.ts`.** Write the recursive walker per the Design notes. Read `packages/core/src/search/embeddings.ts`'s walker first to match the exact block/inline shape. Escape helper:

```ts
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

Export `caseBodyToHtml(body)`. Keep it pure (no imports beyond `CaseBody` type from `@docjob/types`).

- [ ] **Step 4: Run → PASS.** All 6 tests green.

- [ ] **Step 5: Add `bodyHtml` to the case serialization.** In `packages/core/src/cases/case.mapper.ts`: read the file; find the FULL-case serializer (`serializeCase`) and its output type (`SerializedCase`). Add `bodyHtml: caseBodyToHtml(<the case body>)` to the returned object and `bodyHtml: string` to the type. Import `caseBodyToHtml` from `./case-body-html`.
  - **List bloat guard:** if there is a SEPARATE lighter list-item mapper/type (e.g. `serializeCaseListItem`/`SerializedCaseListItem`) used by `cases.list`/`listPaged`, do NOT add `bodyHtml` there — list views don't render the body. Only the full `serializeCase` (used by `cases.byId`) needs it. If `list`/`listPaged` reuse the full `serializeCase`, adding `bodyHtml` rides along — that is acceptable per the brief; note it in the report.

- [ ] **Step 6: Assert the API carries it.** In `packages/api/src/routers/cases.test.ts` (or a new `cases.bodyhtml.test.ts`), add a test that drives `cases.byId` through the in-process caller (see existing api router tests for the `createCaller`/context pattern with an admin/approved actor + a seeded case) and asserts the result has `typeof result.bodyHtml === 'string'` and, for a case whose body has a paragraph, that `bodyHtml` contains `<p>`.

- [ ] **Step 7: Full gate + commit.**

Run: `pnpm typecheck && pnpm test`

```bash
git add packages/core/src/cases/case-body-html.ts packages/core/src/cases/case-body-html.test.ts packages/core/src/cases/case.mapper.ts packages/api/src/routers
git commit -m "feat(sp4a): server-side BlockNote->HTML (caseBodyToHtml) + bodyHtml on SerializedCase"
```

---

### Task 2 (A2): `EmailSender` port + email templates into core + `contact.send` actually delivers

**Files:**
- Create: `packages/core/src/shared/email-port.ts` (`EmailSender`, `EmailMessage`)
- Create: `packages/core/src/shared/email-templates.ts` (move `buildContactEmail`, `buildPasswordResetEmail` here, pure)
- Modify: `packages/core/src/contact/contact.service.ts` (add `sendContactMessage(input, deps)`)
- Create: `packages/core/src/contact/contact.service.test.ts` additions (spy sender)
- Modify: `packages/api/src/context.ts` (add `email: EmailSender` to `ApiContext` + `createContext` params)
- Modify: `packages/api/src/routers/contact.ts` (`send` calls `core.contact.sendContactMessage(input, { email: ctx.email })`)
- Modify: `apps/web/src/app/api/trpc/[trpc]/route.ts` (inject a Resend-backed `EmailSender` adapter into `createContext`)
- Modify: `apps/web/src/lib/trpc/server.ts` (the in-process server caller — provide `email` when it builds context; a no-op sender is fine for RSC)
- Modify: `apps/web/src/lib/email.ts` (re-export the moved templates for backward compat) + `apps/web/src/app/actions.ts` (import templates from their new home if needed)

**Interfaces:**
- Produces: `interface EmailMessage { to: string; subject: string; html: string; text: string; replyTo?: string }` and `interface EmailSender { send(msg: EmailMessage): Promise<void> }` (`email-port.ts`).
- Produces: `buildContactEmail(...)` and `buildPasswordResetEmail(...)` in `core/shared/email-templates.ts` (moved verbatim from `apps/web/src/lib/email.ts`; keep signatures identical).
- Produces: `core.contact.sendContactMessage(input: ContactMessageInput, deps: { email: EmailSender }): Promise<{ sent: true }>` — validates via `parseContactMessage`, no-ops (returns `{sent:true}`) on honeypot, else builds the contact email + `deps.email.send`.
- Produces: `ApiContext` gains `email: EmailSender`; `createContext({ req, keys, email })`.

- [ ] **Step 1: Failing core unit test** in `contact.service.test.ts` (add to the existing file):

```ts
import { vi } from 'vitest';
import * as contact from './contact.service';

it('sendContactMessage delivers a valid message exactly once', async () => {
  const send = vi.fn(async () => {});
  const res = await contact.sendContactMessage(
    { name: 'Ann', email: 'a@b.test', message: 'Hello there team', company: '' },
    { email: { send } },
  );
  expect(res).toEqual({ sent: true });
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0].subject).toBeTruthy();
});

it('sendContactMessage drops honeypot submissions without sending', async () => {
  const send = vi.fn(async () => {});
  const res = await contact.sendContactMessage(
    { name: 'Bot', email: 'bot@b.test', message: 'spam spam spam', company: 'ACME' },
    { email: { send } },
  );
  expect(res).toEqual({ sent: true });
  expect(send).not.toHaveBeenCalled();
});
```

(Use the real field names of `ContactMessageInput` — read `contact.service.ts` first; the honeypot field is `company`.)

- [ ] **Step 2: Run → FAIL** (`sendContactMessage` not exported).

- [ ] **Step 3: Implement.** Create `email-port.ts` (the two interfaces). Create `email-templates.ts` by MOVING `buildContactEmail` + `buildPasswordResetEmail` out of `apps/web/src/lib/email.ts` (cut them; keep signatures). In `contact.service.ts` add `sendContactMessage(input, deps)` using the existing `parseContactMessage` (honeypot → return `{sent:true}` without sending) + `buildContactEmail` + `deps.email.send`. In `apps/web/src/lib/email.ts`, re-export the moved templates (`export { buildContactEmail, buildPasswordResetEmail } from '@docjob/core'`... but web can import core — verify `@docjob/core` re-exports them; add barrel exports in `packages/core/src/index.ts` for the templates + `EmailSender`/`EmailMessage`). Keep `sendEmail` (Resend) in `email.ts`.

- [ ] **Step 4: Run → PASS** (both contact tests).

- [ ] **Step 5: Thread `email` through the API context.** In `packages/api/src/context.ts`: add `email: EmailSender` to `ApiContext` and to `createContext`'s params (`createContext({ req, keys, email })`). Import `EmailSender` type from `@docjob/core`. In `packages/api/src/routers/contact.ts`, change `send` to `.mutation(({ ctx, input }) => core.contact.sendContactMessage(input, { email: ctx.email }))` and update the stale header comment (it currently says delivery is deferred).

- [ ] **Step 6: Inject the adapter at both context construction sites.**
  - `apps/web/src/app/api/trpc/[trpc]/route.ts`: build an `EmailSender` adapter `{ send: (m) => sendEmail(m) }` (import `sendEmail` from `@/lib/email`) and pass it: `createContext({ req, keys: verificationKeys(), email: webEmailSender })`.
  - `apps/web/src/lib/trpc/server.ts` (the in-process caller): wherever it builds the context, pass an `email` too — the same `sendEmail` adapter is fine (RSC contact isn't used, but the type must be satisfied).

- [ ] **Step 7: Integration test** — drive `contact.send` through the in-process server caller with a spy sender in context; assert delivery for a valid message and no-send for a honeypot. Add to `packages/api/src/routers/contact.test.ts` (or create it) following the existing caller-test pattern. Confirm honeypot + valid both return `{sent:true}` but only valid calls the spy.

- [ ] **Step 8: Full gate + commit.**

Run: `pnpm typecheck && pnpm test && pnpm build`

```bash
git add packages/core/src/shared packages/core/src/contact packages/core/src/index.ts packages/api/src/context.ts packages/api/src/routers/contact.ts apps/web/src/app/api/trpc apps/web/src/lib/trpc/server.ts apps/web/src/lib/email.ts apps/web/src/app/actions.ts
git commit -m "feat(sp4a): EmailSender port + templates into core; contact.send delivers via injected sender"
```

---

### Task 3 (A3): Password-reset link env + `buildResetLink` + tRPC reset procedures

**Files:**
- Create: `packages/core/src/users/reset-link.ts` (`buildResetLink`) + test
- Modify: `packages/core/src/users/user.service.ts` (optional `sendPasswordResetEmail(input, deps)` that dedups token-issue + link-build + send) — OR keep issuing in the router; see note
- Modify: `packages/api/src/context.ts` (add `passwordResetBase: string` to `ApiContext`/`createContext`)
- Modify: `packages/api/src/routers/users.ts` (add `requestPasswordReset`, `resetPassword`, `checkResetToken` procedures)
- Modify: `apps/web/src/app/api/trpc/[trpc]/route.ts` + `apps/web/src/lib/trpc/server.ts` (inject `passwordResetBase` from env)
- Modify: `apps/web/src/app/actions.ts` (point the existing Server Action at `buildResetLink` to dedup) — optional but preferred
- Modify: `.env.example` (document `PASSWORD_RESET_URL_BASE`)

**Interfaces:**
- Produces: `buildResetLink(base: string, token: string): string` → `${base.replace(/\/$/,'')}/reset-password?token=${encodeURIComponent(token)}`.
- Produces: tRPC `users.requestPasswordReset` (public, input `z.object({ email: z.string() })`, returns `{ sent: true }` unconditionally — anti-enumeration), `users.resetPassword` (public, input `z.object({ token: z.string().min(1), newPassword: z.string().min(6) })` → `core.users.resetPassword`), `users.checkResetToken` (public, input `z.string()` → `core.users.checkResetToken`).
- Produces: `ApiContext` gains `passwordResetBase: string`.

**Decision baked in (per the SP-4 brief):** mobile password reset is **web hand-off for v1** — the link points at the web `/reset-password`. We still land the env + core builder + tRPC procedures now so the base is decoupled from `AUTH_URL` (which is also the CSRF key) and mobile can START a reset over tRPC. Universal/app-links are a later pass.

- [ ] **Step 1: Failing unit test** `packages/core/src/users/reset-link.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildResetLink } from './reset-link';

describe('buildResetLink', () => {
  it('builds a reset URL, stripping a trailing slash and encoding the token', () => {
    expect(buildResetLink('https://app.docjob.test/', 'a b/c')).toBe('https://app.docjob.test/reset-password?token=a%20b%2Fc');
  });
  it('works without a trailing slash', () => {
    expect(buildResetLink('https://app.docjob.test', 'tok')).toBe('https://app.docjob.test/reset-password?token=tok');
  });
});
```

- [ ] **Step 2: Run → FAIL.** Then implement `reset-link.ts` and re-export `buildResetLink` from the core barrel. Run → PASS.

- [ ] **Step 3: Add the tRPC procedures.** In `packages/api/src/routers/users.ts`, add the three procedures. `requestPasswordReset`: call `core.users.requestPasswordReset(input.email)` (existing — issues token, returns `{ rawToken, to } | null`); if it returned a payload, build the link with `buildResetLink(ctx.passwordResetBase, payload.rawToken)`, build the email via `buildPasswordResetEmail(link)` (from core, A2), and `ctx.email.send({ to: payload.to, ... })`. Always return `{ sent: true }` (anti-enumeration; never reveal whether the email exists). `resetPassword` → `core.users.resetPassword(input.token, input.newPassword)`. `checkResetToken` → `core.users.checkResetToken(input)`. (Read `user.service.ts` for the exact signatures/return shapes of these three core functions before wiring.)

- [ ] **Step 4: Thread `passwordResetBase` into context.** Add it to `ApiContext`/`createContext` (context.ts). In the web mount + server caller, pass `passwordResetBase: process.env.PASSWORD_RESET_URL_BASE ?? process.env.AUTH_URL ?? 'http://localhost:3000'`. Add `PASSWORD_RESET_URL_BASE` to `.env.example` with a comment (client-facing reset-link base, decoupled from AUTH_URL).

- [ ] **Step 5: Dedup the Server Action (preferred).** Point `requestPasswordReset` in `apps/web/src/app/actions.ts` at `buildResetLink` + the core `buildPasswordResetEmail` so the web and tRPC paths emit an identical link (removes the local `resetBaseUrl()` URL string-building duplication). Keep the Server Action's email send. If this expands scope unexpectedly, leave the action as-is and note it — the tRPC procedures are the deliverable.

- [ ] **Step 6: Integration test** in `packages/api/src/routers/users.test.ts` (or a new file): drive `users.requestPasswordReset` through the caller with a spy `EmailSender` + a fixed `passwordResetBase` in context, for a seeded approved user → assert the spy was called once with a `to` matching the user and an email body containing `${base}/reset-password?token=`. For an unknown email → assert `{ sent: true }` and the spy NOT called (anti-enumeration). Assert `checkResetToken` returns `{ valid: false }` for garbage.

- [ ] **Step 7: Full gate + commit.**

```bash
git add packages/core/src/users/reset-link.ts packages/core/src/users/reset-link.test.ts packages/core/src/index.ts packages/api/src/context.ts packages/api/src/routers/users.ts packages/api/src/routers/users.test.ts apps/web/src/app/api/trpc apps/web/src/lib/trpc/server.ts apps/web/src/app/actions.ts .env.example
git commit -m "feat(sp4a): password-reset base env + buildResetLink + tRPC requestPasswordReset/resetPassword/checkResetToken"
```

---

### Task 4 (A4): Attachment route Bearer access (`getUserFromRequest`)

**Files:**
- Modify: `apps/web/src/lib/session.ts` (add `getUserFromRequest(req)`) — or a new `apps/web/src/lib/request-auth.ts`
- Modify: `apps/web/src/app/api/attachments/[filename]/route.ts` (use it)
- Create/modify test: `apps/web/src/lib/request-auth.test.ts` (or add to an existing web test)

**Interfaces:**
- Produces: `getUserFromRequest(req: Request): Promise<SessionUser | null>` — reads `Authorization: Bearer <jwt>` first, else the access cookie; verifies with `verificationKeys()` (`@/lib/auth-keys`); re-reads the `User` row from Postgres by the token `sub`; returns the same shape `getCurrentUser()` returns, or `null`. Mirrors `packages/api/src/context.ts` extraction.

- [ ] **Step 1: Failing test** `request-auth.test.ts`. Use `@docjob/auth`'s token helpers to mint a valid access JWT for a seeded user, then:

```ts
// craft a Request with Authorization: Bearer <jwt> -> resolves the seeded user
// craft a Request with no auth -> resolves null
```

Read `packages/auth/src/tokens.ts` for the exact `signAccessToken`/claims helper + `apps/web/src/lib/auth-keys.ts` for the signing key, and `apps/web/src/lib/session.ts` for the current `getCurrentUser` shape. Seed/lookup a real user via `@docjob/db` `prisma` (real Postgres, like core tests) OR mock the DB read — prefer the real DB read to mirror `getCurrentUser`.

- [ ] **Step 2: Run → FAIL.** Implement `getUserFromRequest(req)`: parse Bearer via `/^Bearer\s+(.+)$/i` from `req.headers.get('authorization')`; else read the access cookie from `req` (parse the `cookie` header for `docjob-access`/`__Host-docjob-access`); `verifyAccessToken(token, verificationKeys())`; if valid, re-read `prisma.user.findUnique({ where: { id: claims.sub } })` and map to the session-user shape; return `null` on any failure. Keep `getCurrentUser()` (cookie-via-`cookies()`) working for existing callers — `getUserFromRequest` is the req-driven variant.

- [ ] **Step 3: Run → PASS.**

- [ ] **Step 4: Wire the attachments route.** In `apps/web/src/app/api/attachments/[filename]/route.ts`, replace the `requireUser()` (cookie-only) gate with `const user = await getUserFromRequest(req); if (!user) return new Response('Unauthorized', { status: 401 });`. The handler already receives `req`. Keep the path-traversal guard + streaming logic unchanged.

- [ ] **Step 5: Route-level test / manual curl.** Add a route test if the repo has a pattern for it; otherwise verify with the dev server: `curl -H "Authorization: Bearer <token>" http://localhost:3000/api/attachments/<seeded-file>` returns 200 (was 401), and no-token returns 401. Document the result.

- [ ] **Step 6: Full gate + commit.**

```bash
git add apps/web/src/lib/session.ts apps/web/src/lib/request-auth.ts apps/web/src/lib/request-auth.test.ts apps/web/src/app/api/attachments
git commit -m "feat(sp4a): Bearer-capable getUserFromRequest; attachments route accepts Bearer"
```

---

### Task 5 (A5): Mobile-transport auth endpoints (token-in-body login/refresh/logout + Bearer /me)

**Files:**
- Modify: `apps/web/src/app/api/auth/login/route.ts`
- Modify: `apps/web/src/app/api/auth/refresh/route.ts`
- Modify: `apps/web/src/app/api/auth/logout/route.ts`
- Modify: `apps/web/src/app/api/auth/me/route.ts`
- Modify/create tests: `apps/web/src/app/api/auth/*.test.ts` (or a consolidated `auth-mobile.test.ts`)

**Interfaces (additive — web cookie behavior is preserved unchanged):**
- `POST /api/auth/login`: on success ALSO return `{ user, access, refresh, refreshExpiresAt }` in the JSON body (today only `{ user }`). Still sets cookies. Accept optional `deviceLabel` in the request body → forward to `login()` (`issueRefreshFamily` accepts it). Preserve `401 {status:'pending'}`, `401 {status:'invalid'}`, `429 {status:'locked', retryAfterSeconds}`.
- `POST /api/auth/refresh`: accept the refresh token from the request body (`{ refresh }`) or an `X-Refresh-Token` header IN ADDITION to the cookie (cookie still works for web). On success ALSO return `{ user, access, refresh, refreshExpiresAt }` in the body (the rotated `newRaw`/`expiresAt`). Preserve cookie rotation for web.
- `POST /api/auth/logout`: accept the refresh token from body/header in addition to the cookie, so the presented family is revoked for Bearer clients. Still clears cookies + returns `{ ok: true }`.
- `GET /api/auth/me`: read the access token from `Authorization: Bearer` first, else the cookie (reuse the same bearer parse). Return `{ user }`/`{ user: null }`.

**Design notes:**
- Reuse ONE bearer-parse helper (from A4's `getUserFromRequest` or a small shared `bearerToken(req)`), don't re-implement per route.
- Do NOT change token signing/verification, rotation, reuse-detection, grace, rate-limiting, or the CSRF logic. The Bearer path is CSRF-exempt only when no cookie is present (a mobile client sends no cookie) — this is already handled by `assertSameOrigin`; these routes keep calling it exactly as they do now.
- The security-critical property to preserve: the raw refresh token still appears in exactly ONE successful response and is single-use. Returning it in the body (for mobile) is the same token that goes in the Set-Cookie; do not mint two.

- [ ] **Step 1: Failing route tests** (`apps/web/src/app/api/auth/auth-mobile.test.ts`). Using the route handlers directly (import the `POST`/`GET` and call with crafted `Request`s) + a seeded approved user (real Postgres):
  - login with valid creds → 200, body has non-empty `access` (a JWT) + `refresh` + `refreshExpiresAt`.
  - `/api/auth/me` with `Authorization: Bearer <access from login>` → 200 `{ user: { id, ... } }`.
  - refresh with `{ refresh: <refresh from login> }` in the body → 200, body has a NEW `access` + a NEW `refresh` (different from the input) + `refreshExpiresAt`.
  - refresh presenting the SAME (now-rotated) refresh a second time, after the 10s grace has NOT been engaged in-test (present it twice rapidly is fine for grace; to assert reuse, present the ORIGINAL after a successful rotation) → the family is revoked / a subsequent refresh fails. (Keep this assertion robust to the grace window — assert that reuse of an already-rotated-and-superseded token eventually yields a 401, and that a valid rotation yields 200.)
  - logout with `{ refresh }` → 200 `{ ok: true }`, and a subsequent refresh with that token → 401.

Read the existing `login`/`refresh`/`logout`/`me` route files + `@docjob/auth`'s `login`/`rotateRefresh`/`revokeFamily` + `apps/web/src/lib/auth-cookies.ts` first, so the test uses the real shapes.

- [ ] **Step 2: Run → FAIL** (bodies don't carry tokens yet).

- [ ] **Step 3: Implement the four route changes** per Interfaces. Add token fields to the login/refresh JSON bodies (the values already exist in the `login()`/`rotateRefresh()` results the routes compute for the cookies — surface them in the body too). Make refresh/logout read `req` body/`X-Refresh-Token` header as a fallback source for the refresh token. Make `/me` read Bearer first. Keep all cookie writes/clears + `assertSameOrigin` calls unchanged.

- [ ] **Step 4: Run → PASS.** All mobile-transport assertions green; existing web auth tests still green (cookies unchanged).

- [ ] **Step 5: Full gate + commit.**

Run: `pnpm typecheck && pnpm test && pnpm build`

```bash
git add apps/web/src/app/api/auth
git commit -m "feat(sp4a): mobile-transport auth — token-in-body login/refresh/logout + Bearer /me"
```

---

## Self-Review

**Gap coverage (from the SP-4 understand brief §A):** A1 body-HTML (T1) · A2 contact-email-into-core (T2) · A3 reset-link env + tRPC procs (T3) · A4 attachment Bearer (T4) · A5 mobile auth endpoints (T5). ✅ All five.

**Boundary safety:** T1's `caseBodyToHtml` is a pure walker in core (no React, no `@blocknote/server-util`) — obeys `packages/core/boundary.test.ts`. T2/T3 keep `resend`/`@/lib` OUT of core: the `EmailSender` port is injected; the Resend adapter lives only in the web mount. `@docjob/api` gains `email`/`passwordResetBase` on its context but imports only the `EmailSender` TYPE from core — obeys `packages/api/boundary.test.ts`. T4/T5 are web/auth-infra only.

**Placeholder scan:** every step has concrete code or a concrete "read file X then wire Y" instruction with the exact function/type names. The two "read the existing shape first" instructions (T2 honeypot field name, T5 route/auth shapes) are conform-to-adjacent-code directions, with the expected names given.

**Type consistency:** `EmailSender`/`EmailMessage` defined in T2 are consumed by T2 (contact) and T3 (reset). `ApiContext` gains `email` (T2) then `passwordResetBase` (T3) — both context-construction sites (web mount + server caller) updated in the task that adds each field. `buildResetLink(base, token)` (T3) matches its test + caller. `getUserFromRequest(req)` (T4) is reused by T5's Bearer parse. `bodyHtml` (T1) flows to mobile via `inferRouterOutputs` in SP-4b.

## Risks
- **Context fan-out:** adding `email` + `passwordResetBase` to `ApiContext` touches EVERY `createContext` call site. There are two known ones (the HTTP route mount + the in-process server caller). T2/T3 must update both or typecheck fails — that's the intended safety net. If a third construction site exists (e.g. a test helper), update it too.
- **`serializeCase` list bloat (T1):** if `cases.list`/`listPaged` reuse the full `serializeCase`, `bodyHtml` rides along and enlarges list payloads. Accept it per the brief, but prefer scoping `bodyHtml` to the full/byId path if a lighter list-item mapper exists. Note the decision in the report.
- **Email templates moving (T2):** `apps/web/src/lib/email.ts` currently exports `buildContactEmail`/`buildPasswordResetEmail`; several web callers (`actions.ts`) import them. Moving to core + re-exporting keeps them working — verify no caller breaks (typecheck catches it).
- **Refresh reuse assertion (T5):** the 10s grace window makes a naive "present twice → revoked" test flaky. Assert the durable property (a superseded token eventually 401s; a valid rotation 200s) rather than timing the grace.
- **Route test harness:** if `apps/web` lacks a pattern for invoking route handlers in vitest, T4/T5 may need a small helper to call the exported `POST`/`GET` with a `Request`. Follow any existing `apps/web/src/app/api/**/*.test.ts`; if none, add the helper in the first task that needs it.
