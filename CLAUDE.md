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
- **Image storage**: filesystem under `UPLOAD_DIR` (mounted volume `uploads` in docker-compose). Upload endpoint `src/app/api/images/upload/route.ts` (admin-only); serve endpoint `src/app/api/images/[filename]/route.ts` streams from disk with path-traversal guard. Utilities in `src/lib/storage.ts`.

### Client state

- `src/hooks/use-user-store.tsx` — context wrapper over `next-auth/react`'s `useSession` + server actions. Exposes legacy-compatible API (`currentUser`, `allUsers`, `addUser`, `updateUser`, `logout`, `isInitialized`). **Role is normalised to lowercase (`'admin'|'doctor'|'patient'`) for existing callers** even though Prisma stores `ADMIN|DOCTOR|PATIENT`.
- `src/hooks/use-patient-store.tsx` — fetches `Case` records via `getCases` Server Action, exposes legacy `Patient` shape with nested `scenario` object. Active-patient selection is per-user in `localStorage` (`activePatient_{userId}`).
- `src/hooks/use-tag-store.tsx` — tag pool from `Tag` table with `addTag(label)` mutator.
- Providers are nested in `src/components/app-providers.tsx`: `SessionProvider → UserProvider → PatientProvider → TagProvider`. Order matters (PatientProvider calls `useUserStore`, TagProvider calls both).
- **Gate UI on `isInitialized`** before reading `currentUser`/`activePatient`. See `src/app/page.tsx` for the loader-then-role-branch pattern.
- The `.ts` / `.tsx` duplicates under `src/hooks/` — the `.tsx` files are the source of truth; `.ts` variants are thin re-exports for backward-compat.

### Case taxonomy

`src/lib/case-taxonomy.ts` exports `SUBGROUPS` — four top-level groups (`clinical`, `sanepid`, `best_practices`, `management`) with their specialty lists in Russian. Use `findSubgroup(slug)` / `subgroupLabel(slug)` helpers.

### Server Actions (`src/app/actions.ts`)

- **Genkit flow wrappers**: `handleAnalyzeQuestion`, `handleGenerateScenario`, `handleSimulateComorbidities`, `handleDiagnosePatient`, `handleFileUpload`.
- **Data actions**: `registerUser`, `updateUser`, `getUsers`, `updateUserStatistics`, `createCase`, `updateCase`, `deleteCase`, `getCases`, `getCaseById`, `getTags`, `addTag`, `getNews`, `getSessionUser`.
- Each action: Zod-validates input, guards via `requireUser` / `requireAdmin`, runs Prisma, returns `{ success: true, data } | { success: false, error }`. **When consuming, use `if (result.success)` to narrow — don't combine with `&& result.data` (TS won't narrow that pattern).**
- Serialisation helpers convert Prisma rows → JSON-safe types exported as `SerializedUser` / `SerializedCase` / `SerializedCaseImage`.

### AI layer (Genkit + Gemini) — unchanged

- `src/ai/genkit.ts` — shared `ai` instance (`googleai/gemini-2.5-flash`).
- `src/ai/flows/*.ts` — `'use server'`, Zod schemas via `z` from `genkit`, each flow registered by importing from `src/ai/dev.ts`. Add new flows there too.
- `src/ai/schemas/patient-diagnosis.ts` — shared schemas for the multi-agent diagnosis flow.
- `patient-diagnosis-flow.ts` is the reference for master-dispatcher + specialist-consult pattern.

### Deployment

`docker-compose.yml` has `postgres` (with `postgres_data` volume) and `web` (built from `Dockerfile` multi-stage; runs `prisma migrate deploy && npm start` on boot; `uploads` volume mounted). Set `POSTGRES_PASSWORD` / `NEXTAUTH_SECRET` / `NEXTAUTH_URL` via `.env` before `docker compose up -d`.

### AI layer (Genkit + Gemini)

- `src/ai/genkit.ts` — single shared `ai` instance configured with `googleAI()` plugin and `googleai/gemini-2.5-flash`. Import `ai` from here in every flow.
- `src/ai/flows/*.ts` — each flow is `'use server'`, defines Zod input/output schemas via `z` re-exported from `genkit`, and exports both a typed async wrapper and the `ai.defineFlow(...)` value. Input/output types are inferred with `z.infer` and re-exported.
- `src/ai/schemas/patient-diagnosis.ts` — shared schemas are extracted here when multiple prompts in a flow reuse them. Follow this pattern when a flow grows beyond one prompt.
- `src/ai/dev.ts` — imports every flow file so they register with the Genkit runtime; add new flows here or `genkit:dev` will not see them.
- `src/app/actions.ts` — Next.js Server Actions are the **only** path from UI to Genkit. Each `handle*` action wraps a flow in a try/catch and returns `{ success, data } | { success, error }`. UI components call these actions, never flows directly.

`patient-diagnosis-flow.ts` is the reference pattern for a multi-agent flow: a master dispatcher prompt returns a `specialistConsult` string, and the flow function switches on that string to invoke one of several specialist prompts created by the `createSpecialistPrompt` factory. New specialties should be added both to the factory call list and to the switch.

### App layer (Next.js App Router)

- `src/app/layout.tsx` wraps the tree in `AppProviders` (`src/components/app-providers.tsx`), which nests `UserProvider` → `PatientProvider`. `PatientProvider` calls `useUserStore`, so the order matters.
- `src/hooks/use-user-store.tsx` and `use-patient-store.tsx` are the canonical state stores. They hydrate from `localStorage` on mount, set `isInitialized` when done, and persist back on change. **Always gate UI on `isInitialized` before reading `currentUser` / `activePatient`** — otherwise the first render will see `null` and misroute (see `src/app/page.tsx` for the pattern: loader → role-based branches).
- Roles are `'admin' | 'doctor' | 'patient'`. `src/app/page.tsx` renders a different dashboard per role; `add-doctor`, `add-patient`, `manage-patients`, `login` are separate route segments.
- The duplicate `.ts`/`.tsx` pairs in `src/hooks/` (e.g. `use-user-store.ts` and `use-user-store.tsx`) — the `.tsx` files are the live ones imported throughout the app.

### UI

- shadcn/ui components live in `src/components/ui/` (config in `components.json`, aliases `@/components`, `@/components/ui`, `@/lib/utils`, `@/hooks`). Use `cn()` from `src/lib/utils.ts` for class merging. Icon library is `lucide-react`.
- Tailwind is configured in `tailwind.config.ts` with the shadcn CSS-variable theme; global tokens are in `src/app/globals.css`. The app forces `className="dark"` on `<html>` — design for dark mode first.

### Server-side file handling

`src/services/patient-record.ts` receives uploaded `File` objects from the `handleFileUpload` Server Action and currently just reads `.text()` and returns it — there is no persistent store. If a task requires real storage, this is the integration point.
