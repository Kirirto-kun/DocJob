# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo layout

This is a **pnpm + Turborepo workspace** (`pnpm-workspace.yaml`: `apps/*`, `packages/*`). The Next.js app lives at `apps/web` (package name `web`). Five workspace packages back it: `packages/db` (`@docjob/db`, Prisma schema + a `prisma` singleton — `import { prisma } from '@docjob/db'`), `packages/types` (`@docjob/types`, shared Zod schemas for `Case`/`CaseMode`/`CaseBody` and the generic `Result<T>` type), `packages/core` (`@docjob/core`, transport-agnostic domain services — the bulk of the product's business logic), `packages/auth` (`@docjob/auth`, custom JWT auth), and `packages/config` (`@docjob/config`, env loading — still a thin scaffold). All commands below run from the **repo root** via `turbo`, which fans them out to the relevant workspace package(s) (`turbo.json` wires `build`/`typecheck`/`test` to depend on `@docjob/db`'s `db:generate` first). Use `pnpm --filter web <script>` or `pnpm --filter @docjob/db <script>` to target a single package directly.

## Commands

- `pnpm dev` — `turbo dev` → Next.js dev server (Turbopack) on http://localhost:3000 (equivalent: `pnpm --filter web dev`)
- `pnpm build` — `turbo build` → builds `@docjob/db` (`prisma generate`) then `apps/web` (`next build`) in dependency order
- `pnpm start` — run from `apps/web` (`pnpm --filter web start`) to serve the production build
- `pnpm lint` — `turbo lint` (Next.js ESLint)
- `pnpm typecheck` — `turbo typecheck` (`tsc --noEmit` per package). **Run this explicitly.** `apps/web/next.config.ts` sets `typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true`, so `pnpm build` will not surface type or lint errors on its own.
- `pnpm test` — `turbo test` → runs the `apps/web` vitest suite (plus each package's own `test` script, e.g. `@docjob/auth`/`@docjob/core`'s boundary tests)
- `pnpm docker:up` / `pnpm docker:down` — thin aliases for `docker compose up -d` / `docker compose down` (root `package.json` scripts).
- Genkit dev UI against `src/ai/dev.ts` (**legacy** — only the old Gemini flows live there; the current AI-search and markdown-import logic runs on OpenAI through `@docjob/core` and has no Genkit UI). **Note:** the `genkit:dev`/`genkit:watch` npm-script aliases from the pre-monorepo root `package.json` were not carried over to `apps/web/package.json` in SP-0; the `genkit`/`genkit-cli`/`@genkit-ai/*` deps are still present, so run it directly if needed: `pnpm --filter web exec -- genkit start -- tsx src/ai/dev.ts`.
- `pnpm db:generate` — `turbo db:generate` → `prisma generate` inside `@docjob/db`
- `pnpm --filter @docjob/db db:migrate` (or `pnpm --filter web db:migrate`, a thin passthrough) — `prisma migrate dev` (wrapped in `dotenv-cli` so it reads `../../.env.local` then `../../.env` relative to `packages/db`)
- `pnpm --filter @docjob/db db:deploy` — `prisma migrate deploy` for prod. The Docker entrypoint runs this on container start.
- `pnpm --filter @docjob/db db:seed` — seeds an admin (`admin@docjob.local` / `password123`), a demo doctor, demo cases, tags, and news
- `pnpm --filter @docjob/db db:studio` — Prisma Studio GUI
- `pnpm --filter web import:cases` — bulk-imports reference markdown cases (`reference cases/*.md`) through `core.cases.structureCaseFromMarkdown` (`@docjob/core`), acting as the seeded admin user. Idempotent by case name.
- `pnpm --filter web embed:cases` — backfills `Case.embedding` for any case without one (pgvector, `text-embedding-3-small`). Requires `OPENAI_API_KEY`.
- `docker compose up -d` / `docker compose down` — spin up Postgres + web via docker-compose directly (same as the `pnpm docker:up`/`docker:down` aliases above).

Required env vars in `.env` / `.env.local` **at the repo root** (see `.env.example`):
- `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL` (custom JWT auth, `@docjob/auth` — see Architecture below). Optional `AUTH_SECRET_PREVIOUS` enables zero-downtime `AUTH_SECRET` rotation: access tokens signed with the old secret keep verifying (`kid: 'previous'`) until they expire (~15m) instead of instantly logging everyone out.
- `OPENAI_API_KEY` (**primary** — used by `@docjob/core`'s hybrid case search (`core.search.searchCases`, embeddings) and its markdown-import flow (`core.cases.structureCaseFromMarkdown`)), `OPENAI_MODEL` (defaults to `gpt-4.1`)
- `GOOGLE_API_KEY` (legacy, only if you still call the old Genkit flows)
- `UPLOAD_DIR` (filesystem path for images + attachments; defaults to `./storage/uploads`)

**Local-dev env-loading caveat (post-monorepo-move):** `packages/db`'s `db:*` scripts and `apps/web`'s `import:cases`/`embed:cases` explicitly load env vars via `dotenv-cli -e ../../.env.local -e ../../.env` (relative to their own package). Next.js itself (`next dev` / `next build` / `next start`, run from `apps/web`) only auto-loads `.env*` files relative to its **own** project root and does **not** pick up the repo-root `.env.local`/`.env` on its own. Running `pnpm --filter web dev` (or `pnpm dev`) directly from a shell that hasn't otherwise exported these vars will boot and compile fine but 500 on env-dependent routes (missing `AUTH_SECRET`, missing `OPENAI_API_KEY`, etc.). Work around it locally with `pnpm --filter web exec -- dotenv -e ../../.env.local -e ../../.env -- next dev --turbopack`, or export the vars into your shell before running `pnpm dev`. Production (Docker) is unaffected — `docker-compose.yml` injects env vars directly, not via dotenv autoloading.

**docker-compose tip**: docker-compose only reads `.env` (not `.env.local`) for its own variable substitution. For local dev, either duplicate `.env.local` → `.env`, or pass `--env-file .env.local` explicitly: `docker compose --env-file .env.local up -d postgres`. The `POSTGRES_HOST_PORT` var defaults to `5433` to avoid the common clash with a host-installed Postgres on 5432. If 5433 is also busy (some dev machines in this project have hit that — used `5434`), bump it and update `DATABASE_URL` to match.

Path alias inside `apps/web`: `@/*` → `apps/web/src/*`.

## Architecture (post-rebuild)

The app is a **curated clinical case library** for doctors: admins author/import cases (BlockNote body + attachments), doctors browse/search/save them and leave reviews, and anyone can propose a new case via a submission workflow that admins triage. The hero feature is **AI-powered semantic search** over the case library (hybrid pgvector + LLM query understanding) — there is no chat/tutoring surface. Runs as a **Dockerised Postgres + Next.js stack** self-hosted on a VPS. Firebase scaffolding (`apphosting.yaml`, `firestore.rules`, `dataconnect/`, `functions/`, `legacy_firebase_python/`) is **legacy/unused** at runtime — it lives outside `apps/web`, so it's simply never part of any workspace package's TypeScript project (`apps/web/tsconfig.json`'s `include` only covers its own `src/**`).

### Data & auth layer

- **Database**: Postgres 16 with the `pgvector` extension (Docker service `postgres`). Schema in `packages/db/prisma/schema.prisma`.
- **Models**: `User`, `Case`, `CaseImage`, `CaseAttachment`, `Tag`, `NewsItem`, `SavedCase`, `Review`, `CaseSubmission`, `CaseSubmissionMessage`, `Announcement`, `AnnouncementDismissal`, `PasswordResetToken`, `RefreshToken`. Enums: `Role { ADMIN DOCTOR REVIEWER }`, `CaseMode { CLINICAL_QUEST SANEPID_INVESTIGATION BEST_PRACTICE MANAGEMENT }`.
- `Case` carries `mode CaseMode`, `body Json` (BlockNote document), `embeddingDirty Boolean` (default `true`) and `embedding Unsupported("vector(1536)")?` (pgvector column feeding the hybrid search — see AI layer below). Has-many `CaseImage`, `CaseAttachment`, `Review`, `SavedCase`.
- `CaseAttachment` — uploaded PDF / image / Office docs / txt-csv attached to a case (or pre-uploaded with `caseId = null` until `createCase`/`updateCase` claims it). Holds `filename`, `originalName`, `mimeType`, `size`, `kind`.
- `SavedCase` — a doctor's bookmark of a case (`@@unique([userId, caseId])`).
- `Review` — a free-text review a `User` leaves on a `Case`.
- `CaseSubmission` / `CaseSubmissionMessage` — a user-proposed case idea plus a threaded message log between the submitter and admins (`status` field drives the admin triage queue).
- `Announcement` / `AnnouncementDismissal` — admin-authored popup ads shown to logged-in users, dismissible per-user.
- `PasswordResetToken` / `RefreshToken` — auth-adjacent tokens (see Auth below); both are hashed at rest, never stored in plaintext.
- **ORM**: Prisma, extracted into `@docjob/db` (`packages/db`). Singleton client exported from `packages/db/src/index.ts` (`import { prisma } from '@docjob/db'`). Migrations in `packages/db/prisma/migrations/`. Seed in `packages/db/prisma/seed.ts`.
- **Auth**: custom JWT auth (`@docjob/auth`, `packages/auth`) — NextAuth has been fully removed. Argon2id password hashing (with legacy-bcrypt verify + transparent rehash-on-login for pre-cutover accounts), short-lived keyed access JWTs (jose, ~15m TTL, `kid`-selected verification key so a secret rotation doesn't instantly invalidate outstanding tokens — see `AUTH_SECRET_PREVIOUS` below), and rotating single-use refresh tokens (hashed at rest, reuse-detected, revokes the whole token family on reuse) stored via `@docjob/db`. Login is rate-limited and folds the user-not-found/wrong-password timing oracle into one response. Web transport: `POST /api/auth/login|refresh|logout`, `GET /api/auth/me` (`src/app/api/auth/*`) set/clear httpOnly cookies (`src/lib/auth-cookies.ts`; `__Host-`/`__Secure-` prefixes only over https) and enforce a same-origin CSRF check (`src/lib/csrf.ts`, keyed off `AUTH_URL`). `src/lib/auth-keys.ts` builds the signing/verification key set from `AUTH_SECRET`(+`AUTH_SECRET_PREVIOUS`).
- New `DOCTOR`/`REVIEWER` registrations are **unapproved** (`approvedAt: null`) until an admin approves them (`/admin/pending`, `approveUser`/`rejectUser` actions) — most domain calls gate on `assertApproved` in `@docjob/core` (see below), not just "logged in".
- **Route guard**: `src/middleware.ts` (Edge runtime — verifies the access-token cookie via the Edge-safe `@docjob/auth/tokens` subpath only, no Prisma/argon2) redirects unauthenticated traffic to `/login`. Public paths: `/login`, `/register`, `/landing`, `/news`, `/forgot-password`, `/reset-password`, static image assets, `/legal/*`, `/planet/*`, `/api/auth/*`, `/api/images/*`, `/api/i18n/*`. Note: `/api/attachments/*` is **not** public — it requires a session. Client-side single-flight refresh-then-retry lives in `src/lib/auth-client.ts`.
- **Server-side user helpers**: `src/lib/session.ts` — `getCurrentUser()`, `requireUser()`, `requireAdmin()` for use inside Server Actions / server components; verifies the access-token cookie then re-reads the `User` row from Postgres (DB is the authority, not the JWT claims) so role changes/de-approval take effect on the next request.

### Domain layer (`@docjob/core`)

`packages/core` holds the transport-agnostic business logic that used to live directly in `src/app/actions.ts`. Every domain follows the same convention: a `<domain>.service.ts` with the actual functions (exported namespaced from `packages/core/src/index.ts`, e.g. `export * as cases from './cases/case.service'`) plus, where relevant, a `<domain>.mapper.ts` with the `Serialized*` output types and `serialize*` functions (exported flat, e.g. `serializeCase`, `serializeUser`). Domains: `cases` (CRUD + attachments + markdown import), `users` (register/approve/reject/delete + password-reset tokens), `search` (hybrid AI search + embeddings), `reviews`, `saved` (bookmarks), `tags`, `submissions` (case-proposal workflow), `news`, `announcements`, `contact`, `banners`, plus a `media` storage-interface scaffold not yet wired into any route.

- **Actor model**: every core function takes an `Actor | null` (`{ id, role, approvedAt }`, `packages/core/src/shared/actor.ts`) as its first argument — core never reads cookies or Prisma sessions itself. `assertApproved(actor)` requires a logged-in, admin-approved user; `assertAdmin(actor)` requires `role === 'ADMIN'`; `assertReviewer(actor)` requires `ADMIN` or `REVIEWER`.
- **Errors**: `DomainError` and its subclasses `UnauthorizedError` / `ForbiddenError` / `NotFoundError` / `ValidationError` / `ConflictError` (`packages/core/src/shared/errors.ts`) carry user-safe messages; the web layer maps them to `ActionResult` failures (see Server Actions below).
- **Boundary enforcement**: `packages/core/src/boundary.test.ts` (and the equivalent in `packages/auth`) asserts core/auth import nothing from `next`, `next-auth`, `react`, `server-only`, or `@/*` (the web app's alias) — keeps these packages genuinely transport-agnostic.
- `apps/web/src/app/actions.ts` (Server Actions) are thin wrappers: resolve the `Actor` via `getActor()`, call `core.<domain>.<fn>(actor, input)`, translate thrown `DomainError`s into `ActionResult` via `toActionResult()` (both in `src/lib/action-helpers.ts`), and run any Next.js-specific side effects (`revalidatePath`) that can't live in a transport-agnostic package.

### Case taxonomy and CaseMode

`src/lib/case-taxonomy.ts` exports `SUBGROUPS` — four top-level groups (`clinical`, `sanepid`, `best_practices`, `management`) with their specialty lists in Russian. Use `findSubgroup(slug)` / `subgroupLabel(slug)`.

Each subgroup maps 1:1 to a `CaseMode` (see `CASE_MODE_BY_SUBGROUP`, defined in `@docjob/types` and re-exported through `src/lib/case-schema.ts`):

- `clinical` → `CLINICAL_QUEST`
- `sanepid` → `SANEPID_INVESTIGATION`
- `best_practices` → `BEST_PRACTICE`
- `management` → `MANAGEMENT`

`CaseMode` today is purely a categorization tag on `Case` — there is no longer a per-mode solution shape or evaluation flow attached to it.

### Case schema (`@docjob/types`, re-exported via `src/lib/case-schema.ts`)

`packages/types/src/case.ts` is the single source of truth for case validation, shared between `@docjob/core` (which cannot import from `apps/web`) and the web app. `apps/web/src/lib/case-schema.ts` is now just a `export * from '@docjob/types'` re-export so existing `@/lib/case-schema` imports keep working.

- `CASE_MODES` / `caseModeSchema` — the four-value enum.
- `caseBodySchema` (`{ blocks: unknown[] }`, passthrough — the BlockNote document shape) / `CaseBody`.
- `structuredCaseDraftSchema` / `StructuredCaseDraft` — output shape of the markdown→case import flow: `{ name, age, gender, specialty, tags, bodyMarkdown }`.
- `CASE_MODE_BY_SUBGROUP`, constant `EMPTY_BODY`.

There is no solution/answer-key schema and no chat/evaluation schema — those existed pre-rebuild and were removed along with the chat feature.

### AI layer (OpenAI, inside `@docjob/core`)

- **OpenAI client**: `packages/core/src/openai.ts` — `getOpenAI()` is a **lazy** singleton (constructed on first real call, not at module load, so importing the wide `@docjob/core` barrel — e.g. for the password-reset helpers — never crashes in contexts without `OPENAI_API_KEY` set, like `vitest run`). `DEFAULT_OPENAI_MODEL` reads `OPENAI_MODEL` (default `gpt-4.1`). Note: `apps/web/src/lib/openai.ts` still exists on disk but is dead/unused — nothing imports it anymore; don't wire new code to it.
- **Embeddings**: `packages/core/src/search/embeddings.ts` — `EMBEDDING_MODEL = 'text-embedding-3-small'`, `EMBEDDING_DIMS = 1536`. `embedText(text)` calls the OpenAI embeddings API; `buildCaseEmbeddingText(case)` flattens a case's searchable fields (name, teaser, primaryCondition, specialty, subgroup, tags, BlockNote body) into one string; `upsertCaseEmbedding(caseId)` builds + embeds + persists a case's `embedding` column (fully guarded — a missing key or any error is logged and swallowed so `createCase`/`updateCase` are never broken by it).
- **Hybrid search**: `packages/core/src/search/search.service.ts` exports `searchCases(actor, query)` — the AI-search hero feature. Requires an approved actor (any logged-in, approved user, not admin-only). Pipeline: (1) an LLM call extracts structured intent (refined query, tags, specialty, subgroup) from the natural-language query; (2) the refined query is embedded and run as a pgvector cosine-distance KNN over `Case.embedding` (raw SQL via `prisma.$queryRaw`); (3) results are re-ranked by combining similarity with tag/specialty/subgroup overlap boosts. Falls back to a plain substring search (`fallbackSearchCases`) whenever `OPENAI_API_KEY` is unset, no cases are embedded yet, or any step throws.
- **Markdown import**: `packages/core/src/cases/case-import.service.ts` — `structureCaseFromMarkdown(actor, input)`. Admin-only (`assertAdmin`). Takes raw markdown (a reference case file), the target `mode`, and optional subgroup/specialty hints; returns a `structuredCaseDraftSchema` draft (no solution/task-question fields — those were dropped from the schema entirely). Re-exported through `core.cases.structureCaseFromMarkdown` (same barrel as the rest of the cases domain). Note: the old web-layer `src/ai/runChat.ts` generic structured-output helper was deleted once this flow moved into core (it had exactly one caller).
- **Legacy Genkit flows** in `src/ai/flows/analyze-student-question.ts`, `generate-personalized-scenario.ts`, `simulate-comorbidities.ts`, `patient-diagnosis-flow.ts` and `src/ai/genkit.ts` (`googleai/gemini-2.5-flash`) still compile and are wired up via `src/ai/dev.ts`, but are **not** used by the current UI/actions beyond a few legacy wrapper actions kept for backward compat. Don't extend them.

### Server Actions (`src/app/actions.ts`)

All return `ActionResult<T> = { success: true; data: T } | { success: false; error: string }`. **Use `if (result.success)` to narrow — don't combine with `&& result.data`, TS won't narrow that pattern.** Most actions are thin `core.<domain>.<fn>` wrappers (see Domain layer above); a few (news/announcements admin CRUD, password reset, contact) still keep a bit of Next.js-specific glue (`revalidatePath`, email sending) alongside the core call.

Representative actions by domain:
- **Cases**: `createCase`, `updateCase`, `deleteCase` — admin-oriented (see `core.cases` for the exact per-action gate). `getCases`/`getCasesPaged`/`getCaseById` — any approved user. `updateCaseAttachment`, `deleteCaseAttachment` — admin only. `handleStructureCaseFromMarkdown` — admin-only markdown import.
- **Users/auth**: `registerUser`, `updateUser`, `getUsers`, `getPendingUsers`, `approveUser`, `rejectUser`, `deleteUser`, `getSessionUser`, `requestPasswordReset`, `checkResetToken`, `resetPassword`.
- **Search**: `searchCases(query)` — the AI hybrid search.
- **Reviews**: `createReview`, `deleteReview`, `getReviewsForCase`, `getMyReviews`.
- **Saved cases**: `toggleSavedCase`, `isCaseSaved`, `getSavedCases`, `getSavedCaseIds`.
- **Case submissions**: `createCaseSubmission`, `sendCaseSubmissionMessage`, `getMyCaseSubmissions`, `getAllCaseSubmissions` (admin), `getCaseSubmissionById`, `updateCaseSubmissionStatus` (admin).
- **Tags / news / announcements**: `getTags`, `addTag`; `getNews`, `getNewsItem`, `createNews`, `updateNews`, `deleteNews` (admin); `getActiveAnnouncements`, `dismissAnnouncement`, `getAnnouncements`, `getAnnouncement`, `createAnnouncement`, `updateAnnouncement`, `deleteAnnouncement` (admin).
- **Contact**: `sendContactMessage`.
- **Legacy Genkit wrappers** (kept for the old UI, unrelated to the current product): `handleAnalyzeQuestion`, `handleGenerateScenario`, `handleSimulateComorbidities`, `handleFileUpload`.

Serialisation types/functions (`SerializedUser`, `SerializedCase`, `SerializedCaseAttachment`, `SerializedReview`, `SerializedSubmission`, `SerializedNewsItem`, `SerializedAnnouncement`, ...) live in `@docjob/core`'s per-domain `*.mapper.ts` files, re-exported flat from the `@docjob/core` barrel and used directly by `actions.ts`.

### Attachments and image storage

Filesystem under `UPLOAD_DIR` (mounted as the `uploads` volume in docker-compose). Helpers in `src/lib/storage.ts`:
- `saveImage` / `readImage` / `deleteImage` — small image-only set used by `CaseImage`.
- `saveAttachment` / `readAttachment` / `attachmentKindFromMime` — broader set: image/*, application/pdf, MS Office (doc/docx/xls/xlsx/ppt/pptx), text/plain, text/csv. Hard cap **25 MB** per file.

(`@docjob/core` has a `MediaStorage` interface scaffold at `packages/core/src/media/storage.ts` for an eventual S3-backed adapter, but it isn't wired into any route yet — `/api/attachments/*` and `/api/images/*` still call `@/lib/storage` directly.)

API routes:
- `POST /api/images/upload` (admin only) and `GET /api/images/[filename]` (public, path-traversal guarded).
- `POST /api/attachments/upload` (admin only) — returns `{ id, filename, mimeType, size, kind, url }` and creates a `CaseAttachment` row with `caseId = null`. The eventual `createCase`/`updateCase` claims it via `attachmentIds`.
- `GET /api/attachments/[filename]` — auth required (not in middleware public list).

### Client state

- `src/hooks/use-user-store.tsx` — context wrapper that fetches the current identity from `GET /api/auth/me` (custom JWT auth, cookie-based) + server actions. Exposes legacy-compatible API (`currentUser`, `allUsers`, `addUser`, `updateUser`, `logout`, `isInitialized`). **Role is normalised to lowercase (`'admin'|'doctor'|'reviewer'`) for existing callers** even though Prisma stores `ADMIN|DOCTOR|REVIEWER`.
- `src/hooks/use-patient-store.tsx` — fetches `Case` records via `getCases`, exposes a legacy `Patient`-shaped wrapper around cases. **`activePatient` is deprecated** in the current flow (cases are opened by route, not by global active selection). Still present for backward-compat with older components.
- `src/hooks/use-tag-store.tsx` — tag pool from `Tag` table with `addTag(label)` mutator.
- Providers nest in `src/components/app-providers.tsx`: `UserProvider → AnnouncementModal → PatientProvider → TagProvider`. Order matters (PatientProvider calls `useUserStore`, TagProvider calls both); `AnnouncementModal` renders inside `UserProvider` so it can check the logged-in user before showing an active announcement.
- **Gate UI on `isInitialized`** before reading `currentUser`/`activePatient`. See `src/app/page.tsx` for the loader-then-role-branch pattern.
- Duplicate `.ts`/`.tsx` files under `src/hooks/` — the `.tsx` files are the source of truth; `.ts` variants are thin re-exports.

### App layer (Next.js App Router)

- `src/app/cases/[subgroup]/[caseId]/page.tsx` — Server Component that loads the case, then hands off to `_components/case-page-client.tsx`: a single-column read-only case view (`case-info-panel.tsx` for the BlockNote body/attachments, `case-reviews-panel.tsx` below it, a `save-case-button.tsx` bookmark toggle in the header). **This is the primary case-viewing surface** — there is no chat/interaction column.
- `src/app/cases/[subgroup]/page.tsx` — case list per subgroup. Clicking a card navigates to `/cases/${subgroup}/${caseId}`.
- `src/app/new-case/page.tsx` — admin-only authoring page with two tabs: **Тело кейса** (BlockNote editor) and **Файлы** (attachments manager). Has a markdown-import dialog (`_components/markdown-import-dialog.tsx`) calling `handleStructureCaseFromMarkdown`.
- `src/app/ai-search/` — the AI semantic search page (calls the `searchCases` action).
- `src/app/saved-cases/` — a doctor's bookmarked cases.
- `src/app/suggest-case/` — the case-submission form (feeds `CaseSubmission`).
- `src/app/reviewer/my-reviews/` — a reviewer's own review history.
- `src/app/admin/` — admin console: `cases` (+`[id]/edit`), `users`, `pending` (approval queue), `news` (+`[id]/edit`, `new`), `announcements` (+`[id]/edit`, `new`), `banners`, `case-submissions` (triage queue).
- `src/app/page.tsx` — role-branched dashboard, gated on `isInitialized`.
- Other route segments: `add-doctor`, `login`, `register`, `select-subgroup`, `news`, `profile`, `contacts`, `support`, `legal/{privacy,terms}`, `forgot-password`, `reset-password`, `landing`.

### UI

- shadcn/ui components live in `src/components/ui/` (config in `components.json`, aliases `@/components`, `@/components/ui`, `@/lib/utils`, `@/hooks`). Use `cn()` from `src/lib/utils.ts` for class merging. Icon library is `lucide-react`.
- Tailwind 3 is configured in `tailwind.config.ts` with the shadcn CSS-variable theme; global tokens are in `src/app/globals.css`. The app forces `className="dark"` on `<html>` — design for dark mode first.
- Case-flow components:
  - `case-editor.tsx` — BlockNote authoring (`@blocknote/mantine`, `@blocknote/react`, `@blocknote/core`). Image/file uploads inside the editor go through `/api/attachments/upload`.
  - `case-body-viewer.tsx` — read-only BlockNote renderer for the case body.
  - `case-reviews-panel.tsx` — lists/creates reviews on a case.
  - `save-case-button.tsx` — bookmark toggle (`toggleSavedCase`).
  - `attachments-manager.tsx` — admin attachment upload/list/edit UI (used by `new-case`).
  - `tag-picker.tsx` — tag multi-select backed by `use-tag-store`.
  - `announcement-modal.tsx` — renders the active `Announcement` popup for logged-in users.
  - `banner-ad.tsx` — renders a configured ad banner slot.

### BlockNote integration notes

- Use `@blocknote/mantine` (NOT `@blocknote/shadcn`, which is incompatible with Tailwind 3 in this project). Pair with `@blocknote/react` and `@blocknote/core`.
- Import the BlockNote stylesheet **once** at the top of the editor entrypoint; don't sprinkle it across files.
- All in-editor uploads (image, file, etc.) hit `/api/attachments/upload` and the returned `url` is what BlockNote stores in the block `props`.
- When persisting, save the editor's `document` to `Case.body` (it parses through `caseBodySchema`'s passthrough). When flattening a body to plain text (search-result previews, embedding text), use `caseBodyToPlainText`/`caseBodyPreview` from `src/lib/case-body-text.ts` (web-side) — `@docjob/core` keeps its own private copy of the same walker for building embedding text.

### Deployment

`docker-compose.yml` has `postgres` (with `postgres_data` volume) and `web` (built from `Dockerfile` multi-stage; runs `prisma migrate deploy && npm run start` on boot; `uploads` volume mounted). Set `POSTGRES_PASSWORD` / `AUTH_SECRET` / `AUTH_URL` / `OPENAI_API_KEY` via `.env` before `docker compose up -d` (optional `AUTH_SECRET_PREVIOUS` for zero-downtime secret rotation — see Commands above).

### Server-side file handling (legacy)

`src/services/patient-record.ts` receives uploaded `File` objects from the legacy `handleFileUpload` Server Action and just reads `.text()` — there's no persistent store. New attachment work should go through `saveAttachment` + `CaseAttachment`, not this path.
