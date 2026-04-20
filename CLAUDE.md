# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Next.js dev server (Turbopack) on http://localhost:3000
- `npm run build` / `npm run start` — production build (runs `prisma generate` first) and serve
- `npm run lint` — Next.js ESLint
- `npm run typecheck` — `tsc --noEmit`. **Run this explicitly.** `next.config.ts` sets `typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true`, so `npm run build` will not surface type or lint errors on its own.
- `npm run genkit:dev` — starts the Genkit dev UI against `src/ai/dev.ts` (which imports every flow so they register)
- `npm run db:migrate` — `prisma migrate dev` (wrapped in `dotenv-cli` so it reads `.env.local` then `.env`)
- `npm run db:deploy` — `prisma migrate deploy` for prod. The Docker entrypoint runs this on container start.
- `npm run db:seed` — seeds admin (`admin@medizo.local` / `password123`), demo doctor, 2 cases, tags, news
- `npm run db:studio` — Prisma Studio GUI
- `npm run docker:up` / `docker:down` — spin up Postgres + web via docker-compose

`GOOGLE_API_KEY` (optional, for Genkit flows) + `DATABASE_URL` + `NEXTAUTH_SECRET` + `NEXTAUTH_URL` must be in `.env` / `.env.local`. See `.env.example`.

**docker-compose tip**: docker-compose only reads `.env` (not `.env.local`) for its own variable substitution. For local dev, either duplicate `.env.local` → `.env`, or pass `--env-file .env.local` explicitly: `docker compose --env-file .env.local up -d postgres`. The `POSTGRES_HOST_PORT` var in docker-compose defaults to `5433` to avoid the common clash with a host-installed Postgres on 5432. If 5433 is also busy on your machine, bump to 5434/etc and update `DATABASE_URL` to match.

Path alias: `@/*` → `src/*`.

## Architecture (post-foundation)

The app runs as a **Dockerised Postgres + Next.js stack** self-hosted on a VPS. Firebase scaffolding (`apphosting.yaml`, `firestore.rules`, `dataconnect/`, `functions/`, `medizoai_codebase/`) is **legacy/unused** at runtime and excluded from `tsc` via `tsconfig.json`.

### Data & auth layer

- **Database**: Postgres 16 (Docker service `postgres`). Schema in `prisma/schema.prisma` — models `User`, `Case`, `CaseImage`, `Tag`, `NewsItem`; enum `Role { ADMIN DOCTOR PATIENT }`.
- **ORM**: Prisma. Singleton client in `src/lib/prisma.ts`. Migrations in `prisma/migrations/`. Seed in `prisma/seed.ts`.
- **Auth**: NextAuth v5 (Auth.js) with Credentials provider + JWT sessions + bcrypt password hashing. Split into `src/lib/auth.config.ts` (edge-compatible, used by `src/middleware.ts`) and `src/lib/auth.ts` (full config with Prisma + bcrypt, used by handlers/server code). The handler route is `src/app/api/auth/[...nextauth]/route.ts` → re-exports from `src/lib/auth-handlers.ts`.
- **Route guard**: `src/middleware.ts` redirects unauthenticated traffic to `/login`. Public paths: `/login`, `/register`, `/api/auth/*`, `/api/images/*`.
- **Server-side user helpers**: `src/lib/session.ts` — `getCurrentUser()`, `requireUser()`, `requireAdmin()` for use inside Server Actions / server components.
- **Image storage**: filesystem under `UPLOAD_DIR` (mounted volume `uploads` in docker-compose). Upload endpoint `src/app/api/images/upload/route.ts` (admin-only, 10 MB cap); serve endpoint `src/app/api/images/[filename]/route.ts` streams from disk with path-traversal guard. Utilities in `src/lib/storage.ts` (`saveImage`, `readImage`, `imageExists`, `deleteImage`).
- **Image serve authz — explicit decision**: `/api/images/[filename]` is **public by design** — the middleware lists it in `PUBLIC_PATHS`. UUID filenames give obscurity, not authorization. This is acceptable for case-illustration images (PDFs, X-rays of anonymised cases) but would be a leak if images ever hold patient-identifying data. **Revisit before shipping real patient records.** The fix would be: signed URLs (HMAC over `filename + expiry`) issued by `getCaseById` / `getActiveAttempt`, validated in the serve route.
- **Case mutation policy**: `src/lib/authz.ts` exposes `canMutateCase(user, caseRecord)` / `assertCanMutateCase(user, caseRecord)` — author-or-admin gate used by `updateCase`. Reuse this for any future mutation (including chat-driven "reveal additional finding" that writes to a child row of Case).

### Client state

- `src/hooks/use-user-store.tsx` — context wrapper over `next-auth/react`'s `useSession` + server actions. Exposes legacy-compatible API (`currentUser`, `allUsers`, `addUser`, `updateUser`, `logout`, `isInitialized`). **Role is normalised to lowercase (`'admin'|'doctor'|'patient'`) for existing callers** even though Prisma stores `ADMIN|DOCTOR|PATIENT`.
- `src/hooks/use-patient-store.tsx` — fetches `Case` records via `getCases` Server Action, exposes legacy `Patient` shape with nested `scenario` object. Active-patient selection is per-user in `localStorage` (`activePatient_{userId}`).
- `src/hooks/use-tag-store.tsx` — tag pool from `Tag` table with `addTag(label)` mutator.
- Providers are nested in `src/components/app-providers.tsx`: `SessionProvider → UserProvider → PatientProvider → TagProvider`. Order matters (PatientProvider calls `useUserStore`, TagProvider calls both).
- **Gate UI on `isInitialized`** before reading `currentUser`/`activePatient`. See `src/app/page.tsx` for the loader-then-role-branch pattern.

### Case taxonomy

`src/lib/case-taxonomy.ts` exports `SUBGROUPS` — four top-level groups (`clinical`, `sanepid`, `best_practices`, `management`) with their specialty lists in Russian. Use `findSubgroup(slug)` / `subgroupLabel(slug)` helpers.

### Server Actions (`src/app/actions.ts`)

- **Genkit flow wrappers**: `handleAnalyzeQuestion`, `handleGenerateScenario`, `handleSimulateComorbidities`, `handleDiagnosePatient`, `handleFileUpload`.
- **Data actions**: `registerUser`, `updateUser`, `getUsers`, `updateUserStatistics`, `createCase`, `updateCase`, `deleteCase`, `getCases`, `getCaseById`, `getTags`, `addTag`, `getNews`, `getSessionUser`.
- Each action: Zod-validates input, guards via `requireUser` / `requireAdmin`, runs Prisma, returns `{ success: true, data } | { success: false, error }`. **When consuming, use `if (result.success)` to narrow — don't combine with `&& result.data` (TS won't narrow that pattern).**
- Serialisation helpers convert Prisma rows → JSON-safe types exported as `SerializedUser` / `SerializedCase` / `SerializedCaseImage`.

### AI layer (Genkit + Gemini)

- `src/ai/genkit.ts` — single shared `ai` instance (`googleai/gemini-2.5-flash`). Import `ai` from here in every flow.
- `src/ai/flows/*.ts` — each flow is `'use server'`, defines Zod input/output schemas via `z` re-exported from `genkit`, and exports both a typed async wrapper and the `ai.defineFlow(...)` value.
- `src/ai/schemas/patient-diagnosis.ts` — shared schemas extracted when multiple prompts in a flow reuse them.
- `src/ai/dev.ts` — imports every flow file so they register with the Genkit runtime; **add new flows there or `genkit:dev` won't see them**.
- `src/app/actions.ts` — Next.js Server Actions are the **only** path from UI to Genkit. Each `handle*` action wraps a flow in try/catch. `patient-diagnosis-flow.ts` is the reference for the master-dispatcher + specialist-consult pattern (`createSpecialistPrompt` factory + switch on `specialistConsult`); new specialties go into both the factory call list and the switch.

### App layer (Next.js App Router)

- `src/app/layout.tsx` wraps the tree in `AppProviders` (`src/components/app-providers.tsx`), which nests `SessionProvider` → `UserProvider` → `PatientProvider` → `TagProvider`. Each inner provider calls the one above it, so the order matters.
- Roles are Postgres enum `ADMIN | DOCTOR | PATIENT`. The client stores normalise role to lowercase (`'admin' | 'doctor' | 'patient'`) for legacy callers — don't rely on the enum shape outside `src/lib/auth*` and Prisma types.
- Routes: `/login`, `/register`, `/select-subgroup`, `/cases/[subgroup]`, `/new-case` (admin), `/add-doctor` (admin), `/manage-patients` (doctor), `/profile`, `/support`, `/news`, `/contacts`. Middleware guards every non-public path.
- **Gate UI on `isInitialized`** from the stores before reading `currentUser` / `activePatient`. See `src/app/page.tsx` for the loader-then-role-branch pattern.

### UI

- shadcn/ui components live in `src/components/ui/` (config in `components.json`, aliases `@/components`, `@/components/ui`, `@/lib/utils`, `@/hooks`). Use `cn()` from `src/lib/utils.ts` for class merging. Icon library is `lucide-react`.
- Tailwind is configured in `tailwind.config.ts` with the shadcn CSS-variable theme; global tokens are in `src/app/globals.css`. The app forces `className="dark"` on `<html>` — design for dark mode first.
- `src/components/no-copy-root.tsx` blocks `onCopy`/`onCut`/`onContextMenu` site-wide except inside `input`/`textarea`/`[contenteditable]`. New pages shouldn't need changes for this to work.

### Deployment

`docker-compose.yml` has `postgres` (with `postgres_data` volume) and `web` (built from `Dockerfile` multi-stage; runs `prisma migrate deploy && npm start` on boot; `uploads` volume mounted). Set `POSTGRES_PASSWORD` / `NEXTAUTH_SECRET` / `NEXTAUTH_URL` via `.env` before `docker compose up -d`. See README for the full local + prod recipe.
