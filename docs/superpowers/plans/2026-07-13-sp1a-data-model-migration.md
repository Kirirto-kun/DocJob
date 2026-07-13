# SP-1a: Data-Model Migration & Removed-Feature Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Remove the retired features (AI chat, `solution`, `taskQuestions`, `PATIENT` role + legacy patient fields, `User.avatar`) from code and schema, add the `RefreshToken` model and `Case.embeddingDirty`, and keep `apps/web` building, type-checking, and serving — with `CaseMode`, banners, support, reviews, submissions, news, announcements, RU+KK i18n all intact.

**Architecture:** Bottom-up-safe ordering: remove UI consumers first, then server actions/flows, then schema types, then the Prisma migration last — so the app compiles at every task boundary. This is the first sub-project of SP-1 (backend core); `packages/core`, `packages/auth`, `packages/api` come in SP-1b/c/d. The `RefreshToken` model is added here (schema-only) so SP-1c's auth work has its table ready.

**Tech Stack:** Prisma 5 + Postgres/pgvector, Next.js 15 App Router, TypeScript, zod, vitest. Monorepo: app at `apps/web`, DB at `packages/db` (`@docjob/db`).

## Global Constraints

- **Deletion boundary (verbatim from spec §12):** remove ONLY the AI chat subsystem, `Case.solution`, `Case.taskQuestions`, `Role.PATIENT` + `User.{patientIds,medicalRecords,solvedCaseIds,unsolvedCaseIds}`, and `User.avatar`. **Everything else stays as it is on the site** — banners, support, announcements (+ dismissals), news, submissions, reviews, saved cases, SEO, profile.
- **`CaseMode` STAYS** as a categorization enum (powers the admin "type" filter). Remove only its solution coupling (`expectedSolutionKind`, the solution-kind discriminator); KEEP `CASE_MODE_BY_SUBGROUP`.
- **`ChatSession` is dropped WITHOUT a data dump** (spec §12.2).
- **RU + KK** both stay (spec §12.3); i18n cleanup removes only dead keys (chat/diagnosis/solution, patient/managePatients), never a language.
- **Profile "Statistics" card stays but is repurposed** (spec §12.8): drop solved/unsolved counts (came from the removed chat mechanic); show saved-cases count and, for reviewers, reviews-written count.
- **Enum migration:** Postgres has no `ALTER TYPE ... DROP VALUE`; dropping `PATIENT` from `Role` requires a hand-written migration (not Prisma's generated diff). Recipe in Task 8.
- **App must stay green:** after every task, `pnpm typecheck` and `pnpm build` pass. `pnpm test` (existing 2 files) stays green throughout.
- **Brand "DocJob".** Package manager pnpm. Prisma client is `@docjob/db`.
- **Legacy Genkit** (`generate-personalized-scenario`, `patient-diagnosis-flow`, `analyze-student-question`, `simulate-comorbidities`, `src/ai/genkit.ts`, `src/ai/dev.ts`, `GOOGLE_API_KEY`) is dead code but OUTSIDE the deletion boundary — remove a legacy flow in this SP ONLY if it directly references a removed symbol and is cheaper to delete than to patch; otherwise leave it. Note each such deletion in the task.

---

## File Structure (what changes)

Blast-radius, mapped from the current tree (`apps/web/src/…`):

- **Chat UI (delete):** `components/case-chat-view.tsx`, `hooks/use-case-chat.ts`, `components/diagnosis-submit-dialog.tsx`, `components/solution-panel.tsx`, `components/suggested-actions-chips.tsx`
- **Chat server (edit/delete):** `app/actions.ts` (chat actions + `getCaseSolution`), `ai/flows/case-chat-flow.ts` (delete)
- **Case page (edit):** `app/cases/[subgroup]/[caseId]/page.tsx`, `app/cases/[subgroup]/[caseId]/_components/case-page-client.tsx`, `.../case-info-panel.tsx`
- **solution/taskQuestions (edit):** `lib/case-schema.ts`, `ai/flows/structure-case-from-markdown.ts`, `app/new-case/page.tsx` (+ `_components/solution-form.tsx`, `_components/string-list-field.tsx`), `app/admin/cases/[id]/edit/page.tsx`
- **PATIENT + legacy fields (edit):** `app/actions.ts`, `hooks/use-user-store.tsx`, `app/page.tsx`, `app/profile/page.tsx`, `app/admin/users/page.tsx`, `components/scenario-controls.tsx`, `app/add-doctor/page.tsx`, `components/user-switcher.tsx`, `lib/auth.ts`
- **Delete routes/components:** `app/manage-patients/` , `hooks/use-patient-store.tsx`, `components/patient-list.tsx`, `components/patient-info-card.tsx`, `components/patient-record.ts`(service) if present
- **i18n:** `i18n/messages/ru.json`, `i18n/messages/kk.json`
- **SEO:** `app/robots.ts` (stale `/add-patient`)
- **DB:** `packages/db/prisma/schema.prisma`, new migration under `packages/db/prisma/migrations/`, `packages/db/prisma/seed.ts`
- **Import:** `apps/web/scripts/import-cases.ts`

> Task 0 below re-verifies these paths at execution time (grep), because a stale path in a destructive migration plan is dangerous.

---

### Task 0: Blast-radius re-verification (no code change)

**Files:** none (produces a checked inventory).

- [ ] **Step 1: Re-grep every removed symbol and record the current hit set**

Run each and save the output to compare against this plan's File Structure:
```bash
cd apps/web/src
grep -rlnE "ChatSession|case-chat|CaseChat|runCaseChat|handleCaseChat|startCaseChat|getChatSession|resetChatSession|runIntroMessage|getCaseSolution" .
grep -rlnE "caseSolutionSchema|expectedSolutionKind|\.solution|hasSolution|solution-panel|taskQuestions" .
grep -rnE "\bPATIENT\b|['\"]patient['\"]" . | grep -vE "outpatient|inpatient|i18n/messages"
grep -rlnE "solvedCaseIds|unsolvedCaseIds|patientIds|medicalRecords|updateUserStatistics" .
grep -rlnE "\.avatar\b|avatar:" . | grep -v components/ui/avatar
```
- [ ] **Step 2: If the hit set differs from this plan's File Structure, STOP and report** the deltas to the controller before touching code. Otherwise record "inventory matches plan" and proceed. No commit.

---

### Task 1: Remove chat UI components and the case-page chat column

Removes the front-end consumers first so nothing imports the chat hook/flow when later tasks delete them. The case page becomes: case body + reviews (no chat, no solution reveal).

**Files:**
- Delete: `components/case-chat-view.tsx`, `hooks/use-case-chat.ts`, `components/diagnosis-submit-dialog.tsx`, `components/solution-panel.tsx`, `components/suggested-actions-chips.tsx`
- Modify: `app/cases/[subgroup]/[caseId]/_components/case-page-client.tsx` (drop the chat column + solution panel; keep case body + reviews), and `app/cases/[subgroup]/[caseId]/page.tsx` / `_components/case-info-panel.tsx` if they pass chat/solution props

**Interfaces:**
- Produces: a case page whose client component renders only `<CaseBodyViewer/>` + the reviews panel (`case-reviews-panel.tsx`, unchanged).

- [ ] **Step 1: Read `case-page-client.tsx` and map chat/solution usage**

Run: `git show HEAD:apps/web/src/app/cases/[subgroup]/[caseId]/_components/case-page-client.tsx` and note every import/JSX use of `use-case-chat`, `CaseChatView`, `SolutionPanel`, `DiagnosisSubmitDialog`, `SuggestedActionsChips`, and any `getCaseSolution` call.

- [ ] **Step 2: Delete the five chat/solution component+hook files**
```bash
cd apps/web
git rm src/components/case-chat-view.tsx src/hooks/use-case-chat.ts \
       src/components/diagnosis-submit-dialog.tsx src/components/solution-panel.tsx \
       src/components/suggested-actions-chips.tsx
```

- [ ] **Step 3: Rewrite `case-page-client.tsx` to drop chat/solution**

Remove all imports and JSX for the deleted components and the chat hook. The desktop two-column layout becomes a single content column (case body) with the reviews panel below/beside; mobile tabs drop the "chat" tab, keeping "case" + "reviews". Keep every other prop and behavior. (Exact edit depends on Step 1's reading; preserve the existing reviews + body rendering verbatim, delete only chat/solution branches.)

- [ ] **Step 4: Typecheck + build**

Run: `pnpm typecheck` → PASS. Run: `pnpm build` → PASS (no unresolved imports to the deleted files).
Expected: both green. If a residual import remains, fix it before committing.

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "feat(sp1a): remove chat UI + solution panel from the case page"
```

---

### Task 2: Remove chat server actions and the chat flow

**Files:**
- Modify: `app/actions.ts` (remove `handleCaseChat`, `startCaseChat`, `getChatSession`, `resetChatSession`, `getCaseSolution`, and any `caseBodyToText`-for-chat plumbing used ONLY by chat; keep `caseBodyToText` itself — search reuses it in SP-3)
- Delete: `ai/flows/case-chat-flow.ts`

**Interfaces:**
- Consumes: Task 1 (no UI caller remains).
- Produces: `actions.ts` with the chat + solution-reveal actions gone; `prisma.chatSession` no longer referenced anywhere in code (verify with grep — required before Task 8 can drop the model).

- [ ] **Step 1: Confirm no remaining caller of the chat actions**

Run: `grep -rnE "handleCaseChat|startCaseChat|getChatSession|resetChatSession|getCaseSolution" apps/web/src` → after Task 1 this should only show the definitions in `actions.ts`. If a page still calls one, note it.

- [ ] **Step 2: Delete the chat flow file and remove the chat actions**
```bash
cd apps/web
git rm src/ai/flows/case-chat-flow.ts
```
Then edit `app/actions.ts`: delete the five exported functions named above and their imports from `case-chat-flow` and the `ChatSession`-typed helpers. Remove now-unused imports (`runCaseChat`, `runIntroMessage`, chat zod schemas). Leave `caseBodyToText` in place.

- [ ] **Step 3: Verify `prisma.chatSession` is gone from code**

Run: `grep -rn "chatSession\|ChatSession" apps/web/src packages/db/src` → expect NO hits in `apps/web/src` code (the model still exists in `schema.prisma` until Task 8; that's expected). If any code hit remains, remove it.

- [ ] **Step 4: Typecheck + build**

Run: `pnpm typecheck` → PASS. Run: `pnpm build` → PASS.

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "feat(sp1a): remove chat server actions and case-chat flow"
```

---

### Task 3: Remove `solution` and `taskQuestions` from schema types, actions, authoring, and AI import

Keeps `CaseMode` and `CASE_MODE_BY_SUBGROUP`; removes only the solution/task coupling.

**Files:**
- Modify: `lib/case-schema.ts` (delete `caseSolutionSchema`, the solution discriminated union, `expectedSolutionKind`, `taskQuestions` from `structuredCaseDraftSchema` and any case IO schema; KEEP `caseModeSchema`, `caseBodySchema`, `CASE_MODE_BY_SUBGROUP`, `EMPTY_BODY`)
- Modify: `app/actions.ts` (drop `solution`/`taskQuestions` from `createCase`/`updateCase` inputs, `serializeCase` (`hasSolution`), `getCaseById`/`getCases` solution stripping — since solution is gone, remove `hasSolution` entirely)
- Modify: `ai/flows/structure-case-from-markdown.ts` (drop `solution`/`taskQuestions` from the draft schema and rewrite the system prompt to extract body + metadata only — no hidden answer, no task list)
- Modify: `app/new-case/page.tsx` + `_components/solution-form.tsx` (+ `string-list-field.tsx` if only used by task/solution), `app/admin/cases/[id]/edit/page.tsx` (remove the "Задание" and "Правильный ответ" tabs; keep "Тело" + metadata + attachments)
- Modify: `app/cases/[subgroup]/[caseId]/page.tsx` (drop solution/taskQuestions reads)

**Interfaces:**
- Produces: `SerializedCase` without `solution`/`hasSolution`/`taskQuestions`; `structuredCaseDraftSchema` = `{ bodyMarkdown, ...metadata }` only.

- [ ] **Step 1: Edit `lib/case-schema.ts`** — remove the solution union + `expectedSolutionKind` + `taskQuestions`; keep the CaseMode pieces. Run `grep -n "expectedSolutionKind\|caseSolutionSchema\|taskQuestions" lib/case-schema.ts` → no hits after.
- [ ] **Step 2: Edit `app/actions.ts`** — remove solution/taskQuestions/`hasSolution` from inputs, serializers, and returns.
- [ ] **Step 3: Edit `structure-case-from-markdown.ts`** — draft schema + prompt to body+metadata only.
- [ ] **Step 4: Edit the authoring pages** — delete the solution/task tabs in `new-case` + `admin/cases/[id]/edit`; delete `_components/solution-form.tsx`; keep body/metadata/attachments. Delete `string-list-field.tsx` only if `grep -rn "string-list-field" apps/web/src` shows no other user.
- [ ] **Step 5: Edit the case detail page** — drop solution/taskQuestions rendering.
- [ ] **Step 6: Verify** — `grep -rn "taskQuestions\|caseSolutionSchema\|expectedSolutionKind\|hasSolution" apps/web/src` → no hits. `pnpm typecheck` PASS. `pnpm build` PASS.
- [ ] **Step 7: Commit**
```bash
git add -A && git commit -m "feat(sp1a): remove solution + taskQuestions from schema, actions, authoring, AI import"
```

---

### Task 4: Remove `PATIENT` role and legacy user fields (code layer)

Schema/enum change is Task 8; this task removes all CODE references so the app compiles against the soon-to-change model. The `role` enum in zod drops `PATIENT` now; the Prisma enum value is dropped in Task 8.

**Files:**
- Modify: `app/actions.ts` (registerUser/updateUser zod: `role` enum → `['ADMIN','DOCTOR','REVIEWER']`; drop `medicalRecords`/`patientIds`/`solvedCaseIds`/`unsolvedCaseIds`/`avatar` from input schemas, `SerializedUser`, serializers; **delete `updateUserStatistics`** (zero callers))
- Modify: `hooks/use-user-store.tsx` (`UserRole` → `'admin'|'doctor'|'reviewer'`; drop the `'PATIENT'` cast; drop `avatar`)
- Modify: `app/page.tsx` (remove `role === 'patient'` dashboard branch + patient counts)
- Modify: `app/profile/page.tsx` (remove the `patient` role key; **repurpose the Statistics card**: show saved-cases count, and for reviewers reviews-written count; drop solved/unsolved)
- Modify: `app/admin/users/page.tsx` (remove the `PATIENT: 'Пациент'` label entry)
- Modify: `components/scenario-controls.tsx` (this is the legacy patient-upload control writing `medicalRecords`; remove the `role === 'patient'` branch and the medicalRecords write — if the whole component is patient-only legacy, delete it and its imports)
- Modify: `app/add-doctor/page.tsx` (drop `patientIds` from the create payload; drop `avatar`)
- Modify: `components/user-switcher.tsx` (drop `avatar`)
- Modify: `lib/auth.ts` (drop `avatar` from the session user shape if present)
- Delete (patient-only routes/components/hooks): `app/manage-patients/` (whole segment), `hooks/use-patient-store.tsx`, `components/patient-list.tsx`, `components/patient-info-card.tsx`. Remove `PatientProvider` from `components/app-providers.tsx` and any `usePatientStore` callers.

**Interfaces:**
- Produces: `SerializedUser` without `avatar`/patient fields; `UserRole` = admin|doctor|reviewer; no `updateUserStatistics`.

- [ ] **Step 1: Map `usePatientStore` / `PatientProvider` / `scenario-controls` usage** — `grep -rn "usePatientStore\|PatientProvider\|use-patient-store\|scenario-controls\|ScenarioControls\|manage-patients" apps/web/src`. Record every caller (the app-providers nesting, dashboard, etc.).
- [ ] **Step 2: Delete the patient-only routes/components/hooks** (git rm the files above), and remove `PatientProvider` from `app-providers.tsx` (per spec §client-state the provider order is SessionProvider → UserProvider → TagProvider after removal).
- [ ] **Step 3: Edit `actions.ts`** — role enum, drop legacy field schemas/serializers, delete `updateUserStatistics`.
- [ ] **Step 4: Edit `use-user-store.tsx`, `page.tsx`, `profile/page.tsx`, `admin/users/page.tsx`, `add-doctor/page.tsx`, `user-switcher.tsx`, `auth.ts`, `scenario-controls`** per the file list. For profile Statistics: replace solved/unsolved with `savedCases.length` (+ reviewer: reviews count from an existing action like `getMyReviews`).
- [ ] **Step 5: Verify** — `grep -rnE "\bPATIENT\b|['\"]patient['\"]|solvedCaseIds|unsolvedCaseIds|patientIds|medicalRecords|updateUserStatistics" apps/web/src | grep -vE "outpatient|inpatient"` → no hits. `pnpm typecheck` PASS. `pnpm build` PASS.
- [ ] **Step 6: Commit**
```bash
git add -A && git commit -m "feat(sp1a): remove PATIENT role, legacy patient fields, avatar, and patient-only screens"
```

---

### Task 5: i18n cleanup (RU + KK) and robots.ts

**Files:**
- Modify: `i18n/messages/ru.json`, `i18n/messages/kk.json` (remove dead keys only: chat/diagnosis/solution namespaces, and `patient`/`managePatients`/`addPatient`; KEEP both languages and every live key)
- Modify: `app/robots.ts` (remove the stale `/add-patient` disallow/reference)

- [ ] **Step 1: Identify dead keys** — from Tasks 1–4, list the message keys no longer referenced (`grep -rn "t('chat\|t('diagnosis\|t('solution\|managePatients\|addPatient" apps/web/src` should be empty after Task 4). Remove exactly those keys from BOTH `ru.json` and `kk.json`, keeping the two files structurally parallel.
- [ ] **Step 2: Edit `robots.ts`** — drop the `/add-patient` entry.
- [ ] **Step 3: Verify** — `pnpm build` PASS (next-intl loads both catalogs); confirm no runtime missing-key by spot-loading is not required, but ensure JSON is valid: `node -e "require('./apps/web/src/i18n/messages/ru.json');require('./apps/web/src/i18n/messages/kk.json');console.log('i18n ok')"`.
- [ ] **Step 4: Commit**
```bash
git add -A && git commit -m "chore(sp1a): drop dead chat/solution/patient i18n keys (RU+KK) and stale robots entry"
```

---

### Task 6: Verify the app is green with the OLD schema still present

A checkpoint before the destructive migration: all code references are gone, but the DB model still has the columns/tables. Prisma types still include them (harmless — code just doesn't use them). This isolates "code cleanup" from "schema change" so a migration failure can't be confused with a code regression.

**Files:** none.

- [ ] **Step 1:** `pnpm typecheck` PASS, `pnpm build` PASS, `pnpm test` (2 files) PASS.
- [ ] **Step 2:** `grep -rnE "ChatSession|caseSolutionSchema|taskQuestions|\bPATIENT\b|solvedCaseIds|medicalRecords|patientIds|unsolvedCaseIds|updateUserStatistics" apps/web/src packages/db/src` (exclude i18n text, `outpatient`) → **no code hits** (schema.prisma still has them — that's the only place). Record the result. No commit (verification only; if anything fails, fix in the owning task).

---

### Task 7: Schema edit — remove retired fields, add `RefreshToken` + `embeddingDirty`

Edits `schema.prisma` only; the migration SQL is Task 8 (split so the hand-written enum SQL is reviewed on its own).

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Edit `schema.prisma`:**
  - Delete `model ChatSession { … }` and the `chatSessions ChatSession[]` relation on `Case`.
  - On `Case`: delete `solution Json?` and `taskQuestions String[]`; ADD `embeddingDirty Boolean @default(true)`. Keep `mode CaseMode`, `embedding`, everything else.
  - On `User`: delete `avatar`, `solvedCaseIds`, `unsolvedCaseIds`, `patientIds`, `medicalRecords`. Keep `profilePhotoUrl`.
  - In `enum Role`: delete `PATIENT` (keep `ADMIN DOCTOR REVIEWER`).
  - ADD:
    ```prisma
    model RefreshToken {
      id           String    @id @default(cuid())
      userId       String
      user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
      familyId     String
      tokenHash    String    @unique
      expiresAt    DateTime
      rotatedToId  String?
      replacedAt   DateTime?
      revokedAt    DateTime?
      revokeReason String?
      deviceLabel  String?
      createdAt    DateTime  @default(now())

      @@index([userId])
      @@index([familyId])
    }
    ```
    and add `refreshTokens RefreshToken[]` to `model User`.
- [ ] **Step 2: Regenerate the client and typecheck** — `pnpm --filter @docjob/db db:generate` → OK. `pnpm typecheck` → PASS (code no longer references the removed fields, so the regenerated types are compatible).
- [ ] **Step 3: Commit** (schema only; migration next task)
```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(sp1a): schema — drop chat/solution/task/patient/avatar; add RefreshToken + embeddingDirty"
```

---

### Task 8: The migration — hand-written SQL (incl. the `Role` enum drop recipe)

`prisma migrate dev` would try to `ALTER TYPE "Role" DROP VALUE 'PATIENT'`, which Postgres does not support and which fails if any row uses it. Write the migration by hand.

**Files:**
- Create: `packages/db/prisma/migrations/<timestamp>_sp1a_remove_retired_features/migration.sql`

**Interfaces:**
- Consumes: the schema from Task 7.

- [ ] **Step 1: Pre-flight — any PATIENT rows?** Against the dev DB: `docker compose --env-file .env.local up -d postgres` (if not running), then `pnpm --filter @docjob/db exec prisma db execute --stdin <<< "SELECT count(*) FROM \"User\" WHERE role='PATIENT';"`. If >0, the migration must reassign them (Step 2 handles it defensively).
- [ ] **Step 2: Author the migration SQL** at the new migration dir:
```sql
-- Drop ChatSession (no data dump, per decision)
DROP TABLE IF EXISTS "ChatSession";

-- Case: drop solution/taskQuestions, add embeddingDirty
ALTER TABLE "Case" DROP COLUMN IF EXISTS "solution";
ALTER TABLE "Case" DROP COLUMN IF EXISTS "taskQuestions";
ALTER TABLE "Case" ADD COLUMN "embeddingDirty" BOOLEAN NOT NULL DEFAULT true;

-- User: drop legacy fields
ALTER TABLE "User" DROP COLUMN IF EXISTS "avatar";
ALTER TABLE "User" DROP COLUMN IF EXISTS "solvedCaseIds";
ALTER TABLE "User" DROP COLUMN IF EXISTS "unsolvedCaseIds";
ALTER TABLE "User" DROP COLUMN IF EXISTS "patientIds";
ALTER TABLE "User" DROP COLUMN IF EXISTS "medicalRecords";

-- Role enum: reassign any PATIENT users, then drop the value via type swap
UPDATE "User" SET role='DOCTOR' WHERE role='PATIENT';
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('ADMIN', 'DOCTOR', 'REVIEWER');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'DOCTOR';
DROP TYPE "Role_old";

-- RefreshToken
CREATE TABLE "RefreshToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "rotatedToId" TEXT,
  "replacedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revokeReason" TEXT,
  "deviceLabel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```
- [ ] **Step 3: Apply and validate** — `pnpm --filter @docjob/db db:migrate` (applies + records the migration; Prisma will detect the migration matches the schema). Then `pnpm --filter @docjob/db exec prisma migrate status` → "Database schema is up to date". Confirm no drift: the command must NOT want to generate an additional migration.
- [ ] **Step 4: Typecheck + build against the migrated DB** — `pnpm typecheck` PASS, `pnpm build` PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/db/prisma/migrations
git commit -m "feat(sp1a): migration — drop retired columns/tables + Role.PATIENT, add RefreshToken/embeddingDirty"
```

---

### Task 9: Fix the seed and case-import scripts; final gate

**Files:**
- Modify: `packages/db/prisma/seed.ts` (drop `taskQuestions`/`solution` from the demo cases it builds; drop any PATIENT user + legacy-field seeding; KEEP `mode`/`CaseMode`; set `embeddingDirty` default handles itself)
- Modify: `apps/web/scripts/import-cases.ts` (stop feeding `draft.taskQuestions`/`draft.solution` into `createCase`)

- [ ] **Step 1: Edit `seed.ts`** — remove solution/taskQuestions from case creation and any PATIENT/legacy user; keep admin/doctor/reviewer + tags + demo cases + news.
- [ ] **Step 2: Edit `import-cases.ts`** — drop the removed fields from the `createCase` call.
- [ ] **Step 3: Run the seed against the dev DB** — `pnpm --filter @docjob/db db:seed` → completes without error (creates admin/doctor/reviewer + demo cases). If it needs `bcryptjs` and errors on resolution, add `bcryptjs` + `@types/bcryptjs` to `packages/db` devDependencies and re-run.
- [ ] **Step 4: FINAL GATE** — `pnpm typecheck` PASS, `pnpm build` PASS, `pnpm test` PASS. Boot check: `pnpm --filter web dev`, then `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login` → 200 (env now auto-loads via SP-0's dotenv wrapper); open a case route and confirm it renders body + reviews (no chat). Stop the server.
- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "feat(sp1a): update seed + import scripts for the trimmed model; final green gate"
```

---

## Self-Review

**Spec coverage (spec §5b removals + §12 decisions + §13 inventory):** ChatSession/chat flow (Tasks 1–2, 8), solution+taskQuestions (Task 3, 7, 8), PATIENT+legacy fields+avatar (Task 4, 7, 8), updateUserStatistics deletion (Task 4), RefreshToken + embeddingDirty (Task 7, 8), CaseMode KEPT (Tasks 3/7 keep it), RU+KK kept with dead-key cleanup (Task 5), no ChatSession dump (Task 8 `DROP TABLE`), Statistics card repurposed (Task 4), robots stale entry (Task 5), seed+import (Task 9), enum-drop recipe (Task 8). ✅ Each spec item maps to a task.

**Placeholder scan:** The removal steps say "remove X from file Y" rather than reproducing every deleted line — legitimate for deletions (the symbol names + grep gates make them exact). The one place needing generated content — the migration SQL and the RefreshToken model — is given in full. `case-page-client.tsx` and `profile` Statistics edits are described against a mandatory read step (Task 1 Step 1 / Task 4) because their exact current code must be read at execution; the required end-state is specified. No "TODO/TBD".

**Type consistency:** `RefreshToken` fields match between the Prisma model (Task 7) and the migration SQL (Task 8). `UserRole` becomes `admin|doctor|reviewer` (Task 4) consistent with the zod enum `ADMIN|DOCTOR|REVIEWER` and the dropped Prisma enum value (Tasks 4/7/8). `SerializedCase`/`SerializedUser` field removals (Task 3/4) match the schema drops (Task 7).

**Ordering safety:** consumers (UI, Task 1) → actions/flows (Task 2) → types/authoring (Task 3) → user code (Task 4) → i18n (Task 5) → green checkpoint (Task 6) → schema (Task 7) → migration (Task 8) → seed/import + final gate (Task 9). The app compiles at every boundary; the DB change lands only after all code is clean.

## Risks / execution notes

- **Destructive migration:** Task 8 drops columns and `ChatSession`. On the dev DB this is fine (re-seedable). Before running it against any DB with real content, take a `pg_dump` (per DEPLOY.md §12). The plan assumes the dev DB.
- **`scenario-controls.tsx`** may be reachable only via the patient flow; if Task 4 Step 1 shows no non-patient caller, delete it rather than patch it — note which in the commit.
- **Legacy Genkit flows** (`generate-personalized-scenario` references legacy fields) — if Task 4's grep shows one referencing a removed field, delete that legacy flow (it is dead per CLAUDE.md) and note it; do not spend effort patching dead code.
