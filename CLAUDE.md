# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo layout

This is a **pnpm + Turborepo workspace** (`pnpm-workspace.yaml`: `apps/*`, `packages/*`). The Next.js app lives at `apps/web` (package name `web`); Prisma is extracted into `packages/db` (`@docjob/db`, exports a `prisma` singleton — `import { prisma } from '@docjob/db'`); `packages/config` (`@docjob/config`, env loading) and `packages/types` (`@docjob/types`, shared `Result<T>`) are thin scaffolds pending SP-1. All commands below run from the **repo root** via `turbo`, which fans them out to the relevant workspace package(s) (`turbo.json` wires `build`/`typecheck`/`test` to depend on `@docjob/db`'s `db:generate` first). Use `pnpm --filter web <script>` or `pnpm --filter @docjob/db <script>` to target a single package directly.

## Commands

- `pnpm dev` — `turbo dev` → Next.js dev server (Turbopack) on http://localhost:3000 (equivalent: `pnpm --filter web dev`)
- `pnpm build` — `turbo build` → builds `@docjob/db` (`prisma generate`) then `apps/web` (`next build`) in dependency order
- `pnpm start` — run from `apps/web` (`pnpm --filter web start`) to serve the production build
- `pnpm lint` — `turbo lint` (Next.js ESLint)
- `pnpm typecheck` — `turbo typecheck` (`tsc --noEmit` per package). **Run this explicitly.** `apps/web/next.config.ts` sets `typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true`, so `pnpm build` will not surface type or lint errors on its own.
- `pnpm test` — `turbo test` → runs the `apps/web` vitest suite
- Genkit dev UI against `src/ai/dev.ts` (**legacy** — only the old Gemini flows live there; the new chat/import flows run on OpenAI and have no Genkit UI). **Note:** the `genkit:dev`/`genkit:watch` npm-script aliases from the pre-monorepo root `package.json` were not carried over to `apps/web/package.json` in SP-0; the `genkit`/`genkit-cli`/`@genkit-ai/*` deps are still present, so run it directly if needed: `pnpm --filter web exec -- genkit start -- tsx src/ai/dev.ts`.
- `pnpm db:generate` — `turbo db:generate` → `prisma generate` inside `@docjob/db`
- `pnpm --filter @docjob/db db:migrate` (or `pnpm --filter web db:migrate`, a thin passthrough) — `prisma migrate dev` (wrapped in `dotenv-cli` so it reads `../../.env.local` then `../../.env` relative to `packages/db`)
- `pnpm --filter @docjob/db db:deploy` — `prisma migrate deploy` for prod. The Docker entrypoint runs this on container start.
- `pnpm --filter @docjob/db db:seed` — seeds admin (`admin@docjob.local` / `password123`), demo doctor, 2 cases, tags, news
- `pnpm --filter @docjob/db db:studio` — Prisma Studio GUI
- `pnpm --filter web import:cases` — bulk-imports reference markdown cases (`reference cases/*.md`) through `structureCaseFromMarkdown`. Idempotent by case name; admin-owned.
- `docker compose up -d` / `docker compose down` — spin up Postgres + web via docker-compose. **Note:** the `docker:up`/`docker:down` npm-script aliases that used to exist in the pre-monorepo root `package.json` were dropped when the workspace root `package.json` was rebuilt in SP-0; call `docker compose` directly (or `docker compose --env-file .env.local up -d postgres`, per the tip below) until/unless the aliases are re-added.

Required env vars in `.env` / `.env.local` **at the repo root** (see `.env.example`):
- `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `AUTH_TRUST_HOST`
- `OPENAI_API_KEY` (**primary** — used by `case-chat-flow` and `structure-case-from-markdown`), `OPENAI_MODEL` (defaults to `gpt-4.1`)
- `GOOGLE_API_KEY` (legacy, only if you still call old Genkit flows)
- `UPLOAD_DIR` (filesystem path for images + attachments; defaults to `./storage/uploads`)

**Local-dev env-loading caveat (post-monorepo-move):** `packages/db`'s `db:*` scripts and `apps/web`'s `import:cases`/`embed:cases` explicitly load env vars via `dotenv-cli -e ../../.env.local -e ../../.env` (relative to their own package). Next.js itself (`next dev` / `next build` / `next start`, run from `apps/web`) only auto-loads `.env*` files relative to its **own** project root and does **not** pick up the repo-root `.env.local`/`.env` on its own. Running `pnpm --filter web dev` (or `pnpm dev`) directly from a shell that hasn't otherwise exported these vars will boot and compile fine but 500 on env-dependent routes (`MissingSecret` from NextAuth, missing `OPENAI_API_KEY`, etc.). Work around it locally with `pnpm --filter web exec -- dotenv -e ../../.env.local -e ../../.env -- next dev --turbopack`, or export the vars into your shell before running `pnpm dev`. Production (Docker) is unaffected — `docker-compose.yml` injects env vars directly, not via dotenv autoloading.

**docker-compose tip**: docker-compose only reads `.env` (not `.env.local`) for its own variable substitution. For local dev, either duplicate `.env.local` → `.env`, or pass `--env-file .env.local` explicitly: `docker compose --env-file .env.local up -d postgres`. The `POSTGRES_HOST_PORT` var defaults to `5433` to avoid the common clash with a host-installed Postgres on 5432. If 5433 is also busy (some dev machines in this project have hit that — used `5434`), bump it and update `DATABASE_URL` to match.

Path alias inside `apps/web`: `@/*` → `apps/web/src/*`.

## Architecture (post-redesign)

The app is a **chat-driven clinical case simulator**. A user opens a case, the AI plays the role of a Socratic tutor that progressively reveals findings, then evaluates the user's final diagnosis/reflection against a hidden `solution`. Runs as a **Dockerised Postgres + Next.js stack** self-hosted on a VPS. Firebase scaffolding (`apphosting.yaml`, `firestore.rules`, `dataconnect/`, `functions/`, `legacy_firebase_python/`) is **legacy/unused** at runtime and excluded from `tsc` via `tsconfig.json`.

### Data & auth layer

- **Database**: Postgres 16 (Docker service `postgres`). Schema in `packages/db/prisma/schema.prisma`.
- **Models**: `User`, `Case`, `CaseImage`, `CaseAttachment`, `ChatSession`, `Tag`, `NewsItem`. Enums: `Role { ADMIN DOCTOR PATIENT }`, `CaseMode { CLINICAL_QUEST SANEPID_INVESTIGATION BEST_PRACTICE MANAGEMENT }`.
- `Case` carries `mode CaseMode`, `body Json` (BlockNote document), `solution Json?` (hidden answer key), `taskQuestions String[]`. Has-many `CaseAttachment` and `ChatSession`.
- `CaseAttachment` — uploaded PDF / image / Office docs / txt-csv attached to a case (or pre-uploaded with `caseId = null` until `createCase`/`updateCase` claims it). Holds `filename`, `originalName`, `mimeType`, `size`, `kind`.
- `ChatSession` — one row per `(userId, caseId)` (unique). Stores `phase` (`discussing` | `diagnosis_submitted` | `done`), full `messages Json` (array of `ChatHistoryMessage`), `finalAnswer`, `evaluation Json?`, `completedAt`.
- **ORM**: Prisma, extracted into `@docjob/db` (`packages/db`). Singleton client exported from `packages/db/src/index.ts` (`import { prisma } from '@docjob/db'`). Migrations in `packages/db/prisma/migrations/`. Seed in `packages/db/prisma/seed.ts`.
- **Auth**: NextAuth v5 (Auth.js) with Credentials provider + JWT sessions + bcrypt password hashing. Split into `src/lib/auth.config.ts` (edge-compatible, used by `src/middleware.ts`) and `src/lib/auth.ts` (full config with Prisma + bcrypt, used by handlers/server code). The handler route is `src/app/api/auth/[...nextauth]/route.ts` → re-exports from `src/lib/auth-handlers.ts`.
- **Route guard**: `src/middleware.ts` redirects unauthenticated traffic to `/login`. Public paths: `/login`, `/register`, `/api/auth/*`, `/api/images/*`. Note: `/api/attachments/*` is **not** public — it requires a session.
- **Server-side user helpers**: `src/lib/session.ts` — `getCurrentUser()`, `requireUser()`, `requireAdmin()` for use inside Server Actions / server components.

### Case taxonomy and CaseMode

`src/lib/case-taxonomy.ts` exports `SUBGROUPS` — four top-level groups (`clinical`, `sanepid`, `best_practices`, `management`) with their specialty lists in Russian. Use `findSubgroup(slug)` / `subgroupLabel(slug)`.

Each subgroup maps 1:1 to a `CaseMode` (see `CASE_MODE_BY_SUBGROUP` in `src/lib/case-schema.ts`):

- `clinical` → `CLINICAL_QUEST` (clinical incident — diagnosis quest with errors)
- `sanepid` → `SANEPID_INVESTIGATION` (epidemiological incident — same incident shape)
- `best_practices` → `BEST_PRACTICE` (reflection on a successful case)
- `management` → `MANAGEMENT` (reflection on management decisions)

`expectedSolutionKind(mode)` returns `"incident"` for the first two and `"reflection"` for the latter two — the discriminator field on the solution discriminated union.

### Case schema (`src/lib/case-schema.ts`)

Single source of truth for runtime/IO validation:

- `caseModeSchema`, `caseBodySchema` (`{ blocks: unknown[] }`, passthrough — BlockNote doc).
- `caseSolutionSchema` — discriminated union on `kind`:
  - `incident`: `{ diagnosis, errors[], correctAlgorithm, preventability: 'full'|'conditional'|'none' }`
  - `reflection`: `{ keyInsights[], correctDecisions[], lessonsLearned }`
- `chatPhaseSchema`, `chatEvaluationSchema`, `chatResponseSchema` (one AI turn — `reply`, `suggestedActions[]`, `phase`, `evaluation | null`).
- `chatHistoryMessageSchema` / `chatHistorySchema` — what is stored on `ChatSession.messages`.
- `structuredCaseDraftSchema` — output shape for the markdown→case import flow.
- Helpers: `expectedSolutionKind(mode)`, `CASE_MODE_BY_SUBGROUP`, constant `EMPTY_BODY`.

### AI layer (OpenAI primary)

- **OpenAI singleton**: `src/lib/openai.ts` — `openai` instance (singleton via `globalThis`). Constant `DEFAULT_OPENAI_MODEL` from `OPENAI_MODEL` env var (default `gpt-4.1`).
- **Generic structured-output helper**: `src/ai/runChat.ts` — `runChat(schema, messages, options?)` wraps `openai.chat.completions.parse` with `zodResponseFormat(schema, name)` and throws if no `parsed` payload (with refusal text when present). All new flows use this.
- **`src/ai/flows/case-chat-flow.ts`** — main chat flow. Holds 4 system prompts keyed by `CaseMode` and a single Zod `chatResponseSchema`. Exports `runCaseChat(input)` (regular turn, with optional `submittingFinalAnswer` flag that triggers the evaluation+done branch) and `runIntroMessage(input)` (kicks off a session). Input includes `caseBodyText` (BlockNote → flat markdown via `caseBodyToText` in `actions.ts`), `taskQuestions`, full `solution` (used as hidden ground truth — never echoed verbatim in `discussing` phase).
- **`src/ai/flows/structure-case-from-markdown.ts`** — admin import flow. Takes raw markdown (a reference case file), the target `mode`, and optional subgroup/specialty hints; returns a `structuredCaseDraftSchema` JSON blob with `bodyMarkdown`, `taskQuestions`, and a `solution` whose `kind` matches `expectedSolutionKind(mode)`.
- **Legacy Genkit flows** in `src/ai/flows/analyze-student-question.ts`, `generate-personalized-scenario.ts`, `simulate-comorbidities.ts`, `patient-diagnosis-flow.ts` and `src/ai/genkit.ts` (`googleai/gemini-2.5-flash`) still compile and are wired up via `src/ai/dev.ts`, but are **not** used by the redesigned UI/actions. Don't extend them.

### Server Actions (`src/app/actions.ts`)

All return `ActionResult<T> = { success: true; data: T } | { success: false; error: string }`. **Use `if (result.success)` to narrow — don't combine with `&& result.data`, TS won't narrow that pattern.**

Case + chat:
- `createCase`, `updateCase` — admin only. Accept `body` (BlockNote JSON), `solution` (validated against `expectedSolutionKind(mode)` if present), `taskQuestions[]`, `attachmentIds[]` (claims pre-uploaded `CaseAttachment` rows whose `caseId` is null).
- `getCases({ subgroup?, specialty? })`, `getCaseById(id)` — auth required. **Strip `solution`** from the returned `SerializedCase`; expose only `hasSolution: boolean`.
- `getCaseSolution(caseId)` — gated reveal. Returns the full `solution` only when `user.role === 'ADMIN'` **or** the caller's `ChatSession.phase === 'done'`. Otherwise `{ solution: null, available: false }`.
- `startCaseChat(caseId)` — creates/reuses a `ChatSession`, runs `runIntroMessage`, persists the intro turn.
- `handleCaseChat({ caseId, userMessage, submittingFinalAnswer? })` — appends a user turn, runs `runCaseChat`, persists the assistant turn + new `phase`/`evaluation`/`finalAnswer`.
- `getChatSession(caseId)` — current session for the logged-in user, parsed back to typed history.
- `resetChatSession(caseId)` — wipes the row so the user can replay.
- `handleStructureCaseFromMarkdown({ markdown, mode, hintedSubgroup?, hintedSpecialty? })` — admin only.

Other:
- Auth/users: `registerUser`, `updateUser`, `getUsers`, `updateUserStatistics`, `getSessionUser`.
- Tags / news: `getTags`, `addTag`, `getNews`.
- Legacy Genkit wrappers (kept for the old UI): `handleAnalyzeQuestion`, `handleGenerateScenario`, `handleSimulateComorbidities`, `handleFileUpload`.

Serialisation helpers convert Prisma rows → JSON-safe `SerializedUser` / `SerializedCase` / `SerializedCaseImage` / `SerializedCaseAttachment`. `serializeCase` deliberately drops `solution` and exposes `hasSolution`.

### Attachments and image storage

Filesystem under `UPLOAD_DIR` (mounted as the `uploads` volume in docker-compose). Helpers in `src/lib/storage.ts`:
- `saveImage` / `readImage` / `deleteImage` — small image-only set used by `CaseImage`.
- `saveAttachment` / `readAttachment` / `attachmentKindFromMime` — broader set: image/*, application/pdf, MS Office (doc/docx/xls/xlsx/ppt/pptx), text/plain, text/csv. Hard cap **25 MB** per file.

API routes:
- `POST /api/images/upload` (admin only) and `GET /api/images/[filename]` (public, path-traversal guarded).
- `POST /api/attachments/upload` (admin only) — returns `{ id, filename, mimeType, size, kind, url }` and creates a `CaseAttachment` row with `caseId = null`. The eventual `createCase`/`updateCase` claims it via `attachmentIds`.
- `GET /api/attachments/[filename]` — auth required (not in middleware public list).

### Client state

- `src/hooks/use-user-store.tsx` — context wrapper over `next-auth/react`'s `useSession` + server actions. Exposes legacy-compatible API (`currentUser`, `allUsers`, `addUser`, `updateUser`, `logout`, `isInitialized`). **Role is normalised to lowercase (`'admin'|'doctor'|'patient'`) for existing callers** even though Prisma stores `ADMIN|DOCTOR|PATIENT`.
- `src/hooks/use-patient-store.tsx` — fetches `Case` records via `getCases`, exposes legacy `Patient` shape with nested `scenario` object. **`activePatient` is deprecated** in the new flow (cases are opened by route, not by global active selection). Still present for backward-compat with the old dashboard.
- `src/hooks/use-tag-store.tsx` — tag pool from `Tag` table with `addTag(label)` mutator.
- `src/hooks/use-case-chat.ts` — drives the chat UI: loads/creates the `ChatSession`, sends turns through `handleCaseChat`, handles the final-answer submit + reset, and surfaces `phase` / `evaluation`.
- Providers nest in `src/components/app-providers.tsx`: `SessionProvider → UserProvider → PatientProvider → TagProvider`. Order matters (PatientProvider calls `useUserStore`, TagProvider calls both).
- **Gate UI on `isInitialized`** before reading `currentUser`/`activePatient`. See `src/app/page.tsx` for the loader-then-role-branch pattern.
- Duplicate `.ts`/`.tsx` files under `src/hooks/` — the `.tsx` files are the source of truth; `.ts` variants are thin re-exports.

### App layer (Next.js App Router)

- `src/app/cases/[subgroup]/[caseId]/page.tsx` — Server Component that loads the case + initial session, then hands off to `_components/case-page-client.tsx`. Two-column layout on desktop (case body + chat), tabs on mobile. **This is the primary case-running surface.**
- `src/app/cases/[subgroup]/page.tsx` — case list per subgroup. Clicking a card navigates to `/cases/${subgroup}/${caseId}`. The old `setActivePatient → /` flow through the dashboard is deprecated.
- `src/app/new-case/page.tsx` — admin-only authoring page, three tabs: **Тело** (BlockNote editor), **Задание** (numbered task questions), **Правильный ответ** (solution form whose shape switches on `expectedSolutionKind(mode)`). Has a markdown-import button calling `handleStructureCaseFromMarkdown`.
- `src/app/page.tsx` — role-branched dashboard, gated on `isInitialized`.
- Other route segments: `add-doctor`, `add-patient`, `manage-patients`, `login`, `register`, `select-subgroup`, `news`, `profile`, `contacts`, `support`.

### UI

- shadcn/ui components live in `src/components/ui/` (config in `components.json`, aliases `@/components`, `@/components/ui`, `@/lib/utils`, `@/hooks`). Use `cn()` from `src/lib/utils.ts` for class merging. Icon library is `lucide-react`.
- Tailwind 3 is configured in `tailwind.config.ts` with the shadcn CSS-variable theme; global tokens are in `src/app/globals.css`. The app forces `className="dark"` on `<html>` — design for dark mode first.
- New case-flow components:
  - `case-editor.tsx` — BlockNote authoring (`@blocknote/mantine`, `@blocknote/react`, `@blocknote/core`). Image/file uploads inside the editor go through `/api/attachments/upload`.
  - `case-body-viewer.tsx` — read-only BlockNote renderer for runtime case body.
  - `case-chat-view.tsx` — polished chat UI with streaming-style placeholders.
  - `suggested-actions-chips.tsx` — renders the AI's suggested next questions as chips.
  - `diagnosis-submit-dialog.tsx` — modal that confirms a final-answer submission (sets `submittingFinalAnswer: true`).
  - `solution-panel.tsx` — reveals the solution after `phase === 'done'` (or for admins immediately) by calling `getCaseSolution`.

### BlockNote integration notes

- Use `@blocknote/mantine` (NOT `@blocknote/shadcn`, which is incompatible with Tailwind 3 in this project). Pair with `@blocknote/react` and `@blocknote/core`.
- Import the BlockNote stylesheet **once** at the top of the editor entrypoint; don't sprinkle it across files.
- All in-editor uploads (image, file, etc.) hit `/api/attachments/upload` and the returned `url` is what BlockNote stores in the block `props`.
- When persisting, save the editor's `document` to `Case.body` (it parses through `caseBodySchema`'s passthrough). When sending to the AI, flatten via `caseBodyToText` in `actions.ts`.

### Solution gating (important)

`solution` is **never** included in `getCases` / `getCaseById` responses. It exists in three places only:
1. The DB row (`Case.solution`).
2. The chat flow input (server-side, never sent to the browser).
3. `getCaseSolution(caseId)` — gated by `user.role === 'ADMIN'` OR `chatSession.phase === 'done'`.

Don't add new code paths that leak `solution` to the client.

### Deployment

`docker-compose.yml` has `postgres` (with `postgres_data` volume) and `web` (built from `Dockerfile` multi-stage; runs `prisma migrate deploy && npm start` on boot; `uploads` volume mounted). Set `POSTGRES_PASSWORD` / `NEXTAUTH_SECRET` / `NEXTAUTH_URL` / `OPENAI_API_KEY` via `.env` before `docker compose up -d`.

### Server-side file handling (legacy)

`src/services/patient-record.ts` receives uploaded `File` objects from the legacy `handleFileUpload` Server Action and just reads `.text()` — there's no persistent store. New attachment work should go through `saveAttachment` + `CaseAttachment`, not this path.
