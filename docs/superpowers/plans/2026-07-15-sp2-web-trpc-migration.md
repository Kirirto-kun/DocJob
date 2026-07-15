# SP-2: Web → tRPC Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Migrate the `apps/web` client + server components from Next.js Server Actions to the `@docjob/api` tRPC endpoint built in SP-1d: a typed tRPC React-Query client for `'use client'` components, a direct server-side caller for RSC/server components (no HTTP hop), CSRF protection for cookie-based tRPC mutations, and RSC cache-coherence via query invalidation / `router.refresh()` (replacing `revalidatePath`). Retire the migrated Server Actions. Web behavior is unchanged from the user's POV.

**Architecture:** `@trpc/tanstack-react-query` v11 + `@tanstack/react-query` for client components (a `TRPCProvider` in `app-providers.tsx`, hooks call `/api/trpc`). Server components use a `createServerCaller()` that builds a tRPC context with the current request's actor (via the existing `getActor`/session) and calls `appRouter` in-process (no network). The `/api/trpc` route (SP-1d) gains an Origin/Referer CSRF gate for cookie mutations (bearer exempt). As each domain's callers move to tRPC, its Server Action is deleted; `revalidatePath` (server-only) is replaced by client-side `queryClient.invalidateQueries` + `router.refresh()` where needed.

**Tech Stack:** `@trpc/client`, `@trpc/tanstack-react-query`, `@tanstack/react-query` v5, existing `@docjob/api`, Next 15 App Router, vitest + Playwright-style browser smoke.

## Global Constraints

- **Behavior parity:** every migrated screen behaves identically — same data, same loading/empty/error UX, same auth gating, same optimistic behavior where it exists today. This is a transport swap, not a redesign.
- **Two consumption paths, one router:** client components → tRPC React-Query hooks over HTTP `/api/trpc`; server components → an in-process server caller (`appRouter.createCaller(await serverContext())`), NO self-HTTP. Both hit the same `appRouter`.
- **CSRF:** the `/api/trpc` route handler must enforce the same Origin/Referer allowlist (`assertSameOrigin` from SP-1c's `lib/csrf.ts`) for **mutations arriving with a cookie** (state-changing). Bearer-authenticated requests (no cookie) are exempt. Reads (queries) don't need it. Implement at the route handler or as a tRPC middleware that inspects `ctx` — document which.
- **RSC cache coherence:** client mutations CANNOT call `revalidatePath` (server-only). Replace each with (a) `queryClient.invalidateQueries` for the affected query keys, and/or (b) `router.refresh()` when a server component must re-render. Enumerate the 26 current `revalidatePath` targets and map each to its replacement so none is silently lost.
- **Retire actions as migrated:** when ALL callers of a Server Action have moved to tRPC, DELETE the action. At the end, `apps/web/src/app/actions.ts` should retain only anything genuinely not covered by tRPC (there should be little — the legacy Genkit wrappers `handleAnalyzeQuestion`/etc. are dead and out of scope; leave or delete per a note). The file-upload/image routes (`/api/attachments|images|support/upload`) stay as REST routes (multipart), NOT tRPC — they're already `authFetch`-wrapped.
- **Auth:** the tRPC client sends the cookie automatically (same-origin); `authFetch`-style 401→refresh must also apply to tRPC calls — configure the tRPC client's `fetch` to use the single-flight refresh (reuse `lib/auth-client.ts`).
- Brand "DocJob". App green after every task (`pnpm typecheck`/`build`/`test`; browser smoke of the migrated screens).

## Migration surface (from survey)
54 Server Actions · 35 client files import `@/app/actions` · 26 `revalidatePath` sites · no `@trpc/client`/react-query yet. Client stores: `use-tag-store`, `use-user-store` (partly JWT-migrated already), `use-patient-store` (the case catalog store). Server-component action callers: `admin/cases/*`, case detail pages, etc.

---

### Task 1: tRPC client infra — React-Query provider + server caller + refresh-aware fetch

**Files:** create `apps/web/src/lib/trpc/client.ts` (tRPC React-Query client + `TRPCProvider`), `apps/web/src/lib/trpc/server.ts` (`createServerCaller()` — builds server context via `getActor` and returns `appRouter.createCaller(ctx)`), `apps/web/src/lib/trpc/shared.ts` (the `AppRouter`-typed client factory, `httpBatchLink` to `/api/trpc` with a `fetch` that wraps `authFetch`'s single-flight 401→refresh); modify `apps/web/src/components/app-providers.tsx` (wrap in `QueryClientProvider` + `TRPCProvider`). Add deps `@trpc/client`, `@trpc/tanstack-react-query`, `@tanstack/react-query`.

- [ ] TDD-lite (infra): a smoke test/story that the provider renders and a trivial `health` query hook returns `{ok:true}` against a mocked or real endpoint; `createServerCaller()` (with an admin actor context) returns `appRouter` data for `health`/`cases.list`. Verify `pnpm typecheck`/`build` green. Commit `feat(sp2): tRPC React-Query client + server caller + provider`.

---

### Task 2: CSRF on tRPC mutations + refresh-aware client wiring

**Files:** modify `apps/web/src/app/api/trpc/[trpc]/route.ts` (call `assertSameOrigin(req)` for cookie-authenticated mutation requests — detect mutation vs query + cookie-vs-bearer; reject cross-origin cookie mutations with 403); confirm the client `fetch` (Task 1) does single-flight refresh on 401.

- [ ] Implement + verify with curl: a cookie tRPC mutation with a foreign `Origin` → 403; same-origin → passes; a bearer mutation with no cookie → passes (exempt); a query is unaffected. `pnpm build` green. Commit `feat(sp2): CSRF guard for cookie-based tRPC mutations`.

---

### Task 3: Migrate the case-catalog + case pages (read-heavy, server + client)

**Files:** `apps/web/src/app/cases/[subgroup]/page.tsx` (list — server caller), `.../[caseId]/page.tsx` + `_components/case-page-client.tsx` (detail + reviews), `apps/web/src/hooks/use-patient-store.tsx` (the case store — migrate `getCases`/create/update/delete to tRPC), `admin/cases/page.tsx` + `[id]/edit/page.tsx` (server caller for load, tRPC mutations for save). Replace `revalidatePath('/cases/...')` in the old create/update/delete flows with `router.refresh()` + `invalidateQueries(['cases'])`.

- [ ] Migrate each caller to `trpc.cases.*`/`trpc.search.*` (client hooks) or the server caller (RSC); delete the now-unused `getCases`/`getCaseById`/`getCasesPaged`/`createCase`/`updateCase`/`deleteCase`/`searchCases`/attachment actions once no caller remains. Browser smoke: browse a subgroup, open a case (body+reviews render), admin create/edit a case. `pnpm typecheck`/`build`/`test` green. Commit `feat(sp2): migrate case catalog + case pages to tRPC`.

---

### Task 4: Migrate reviews + saved + tags + submissions callers

**Files:** `components/case-reviews-panel.tsx` (reviews), `save-case-button.tsx` + `saved-cases` page (saved), `hooks/use-tag-store.tsx` + `tag-picker.tsx` (tags), `suggest-case/page.tsx` + `reviewer/my-reviews` + submission views (submissions). Migrate to `trpc.reviews/saved/tags/submissions.*` hooks (mutations use `invalidateQueries`). Delete the migrated actions.

- [ ] Migrate + delete actions + browser smoke (write a review, save/unsave a case, add a tag in authoring, submit a case + message thread). Green gates. Commit `feat(sp2): migrate reviews/saved/tags/submissions to tRPC`.

---

### Task 5: Migrate users/profile + admin (users, pending, news, announcements, banners, contact)

**Files:** `hooks/use-user-store.tsx` (getUsers/updateUser/register → tRPC; it's already partly JWT-migrated), `admin/users` + `admin/pending` pages, `components/admin/news-editor.tsx` + `admin/news/*`, `components/admin/announcement-editor.tsx` + `admin/announcements/*` + `announcement-modal.tsx`, `admin/banners` (banners stay REST for the manifest but the CRUD can move to tRPC if it was an action — check), `landing/contact-form.tsx` (contact.send). Migrate to tRPC hooks; replace the admin `revalidatePath` with `invalidateQueries` + `router.refresh()`.
NOTE: **contact email** — SP-1d's `contact.send` validates but doesn't deliver email (the api package can't import `@/lib/email`). For SP-2, keep the web contact-form calling the existing `sendContactMessage` SERVER ACTION (which sends email) rather than tRPC `contact.send`, OR move email delivery into core so `contact.send` works — decide + document (recommended: leave contact on the action until email moves to core in SP-4).

- [ ] Migrate + delete migrated actions + browser smoke (admin user list/approve, create news, create announcement + dismiss, contact form sends). Green gates. Commit `feat(sp2): migrate users/profile + admin CMS to tRPC`.

---

### Task 6: Retire dead actions + revalidatePath sweep + final gate

**Files:** `apps/web/src/app/actions.ts` (remove every action now fully migrated; confirm no `@/app/actions` import remains except any deliberately-kept one), verify all 26 original `revalidatePath` behaviors are covered by invalidation/refresh.

- [ ] **Step 1:** `grep -rn "@/app/actions" apps/web/src` → only deliberately-retained actions remain (ideally empty besides legacy Genkit if kept). Remove the dead actions + now-unused imports/helpers (`getActor`/`toActionResult` may still be used by any retained action; else remove).
- [ ] **Step 2:** enumerate the original 26 `revalidatePath` targets (from git history of actions.ts) and confirm each migrated flow invalidates the right query key or calls `router.refresh()`. Fix any gap.
- [ ] **Step 3: FINAL GATE:** `pnpm typecheck` + `pnpm test` (all packages) + `pnpm build` green. Full browser smoke of the primary flows (login, browse+open case, search, review, save, suggest a case, admin create case/news/announcement, approve a user) — all via tRPC now. Show results. Stop the server.
- [ ] **Step 4: Commit** `feat(sp2): retire migrated Server Actions; SP-2 final gate`.

---

## Self-Review

**Spec coverage (§7 + §5d client side):** tRPC React-Query client (T1) · server caller for RSC (T1) · CSRF on cookie mutations (T2) · refresh-aware fetch (T1/T2) · all domains migrated (T3-T5) · revalidatePath→invalidation/refresh mapping (T3-T6) · actions retired (T6) · behavior parity (all). ✅

**Placeholder scan:** Tasks 3-5 group the 35 client files by domain and name the concrete files + the tRPC namespace each moves to; the mechanical per-file work (swap an action call for a `trpc.X.useQuery/useMutation` hook + invalidation) is a repeated transform, and T1 establishes the exact hook pattern. The one genuine decision (contact email) is called out in T5 with the recommended default (keep on the action until email moves to core).

**Type consistency:** the tRPC client is typed by `AppRouter` (from `@docjob/api`, SP-1d); server caller uses the same `appRouter`; `invalidateQueries` keys follow tanstack-query's tRPC key convention. Migrated screens consume the same `Serialized*` shapes the actions returned.

## Risks
- **RSC cache coherence** is the subtle part: a client mutation that changes data a SERVER component rendered needs `router.refresh()` (not just query invalidation). T3-T6 must check each mutation against what server components display.
- **`use-patient-store`** is the case catalog store (misleadingly named) used broadly — migrate carefully, keep its public API stable.
- **tRPC v11 + tanstack-query v5** API specifics — follow the installed versions' patterns; the `@trpc/tanstack-react-query` integration differs from the older `@trpc/react-query`.
- **Contact email** stays on the Server Action until email moves into core (SP-4 follow-up) — don't silently break contact delivery by moving it to the not-yet-sending tRPC `contact.send`.
- **File uploads** stay REST (`authFetch` multipart) — do NOT try to move them to tRPC.
