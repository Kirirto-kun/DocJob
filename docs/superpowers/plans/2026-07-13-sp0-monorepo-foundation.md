# SP-0: Monorepo Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the single-package Next.js repo into a pnpm + Turborepo monorepo (`apps/web` + `packages/db`, `packages/config`, `packages/types`) with the existing app fully working — same routes, same build, same passing tests.

**Architecture:** Non-invasive restructure. The Next app moves wholesale into `apps/web` keeping its `@/* → ./src/*` alias intact, so its ~571 `@/…` imports across 138 files are NOT rewritten. Only three concerns are extracted into shared packages: the Prisma client + schema (`@docjob/db`, 5 import sites), env validation (`@docjob/config`), and shared zod/types scaffold (`@docjob/types`). Turborepo orchestrates build/dev/lint/typecheck/test and per-package `prisma generate`.

**Tech Stack:** pnpm workspaces, Turborepo, Next.js 15, Prisma 5, TypeScript 5, vitest, zod.

## Global Constraints

- **Brand:** user-facing name is always "DocJob", never "MEDIZO".
- **Package scope:** internal packages are named `@docjob/<name>` (`@docjob/db`, `@docjob/config`, `@docjob/types`).
- **Package manager:** pnpm only after this SP. Delete `package-lock.json`; commit `pnpm-lock.yaml`.
- **No behavior change:** SP-0 changes zero runtime behavior. Every route, action, and the 2 existing tests must work identically. This is pure restructure.
- **Path alias:** `apps/web` keeps `@/* → ./src/*`. Do NOT rewrite `@/…` app imports to package paths in this SP.
- **Node:** Node 20 (matches Dockerfile `node:20-alpine`).
- **Verification is the test:** SP-0 has no new unit logic; each task's gate is a green command (build / typecheck / existing test suite / dev boot). Treat a failing gate as a failing test — stop and fix before proceeding.
- **Legacy dirs stay excluded:** `functions/`, `dataconnect/`, `legacy_firebase_python/`, `apphosting.yaml`, `firestore.*` remain out of scope (already tsc-excluded).

---

## File Structure (target)

```
docjob/
├── package.json                 # root: workspaces + turbo scripts (private, no app deps)
├── pnpm-workspace.yaml
├── turbo.json
├── .npmrc                       # pnpm settings
├── tsconfig.base.json           # shared compiler options
├── apps/
│   └── web/                     # the entire current Next app
│       ├── package.json         # name "web", depends on @docjob/{db,config,types}
│       ├── next.config.ts  tailwind.config.ts  postcss.config.mjs
│       ├── components.json  vitest.config.ts  next-env.d.ts
│       ├── tsconfig.json        # extends ../../tsconfig.base.json, keeps @/* alias
│       ├── src/                 # unchanged (routes, components, actions, lib, hooks, ai)
│       ├── public/  scripts/  storage/
│       └── (prisma schema NO LONGER here — moves to packages/db)
└── packages/
    ├── db/
    │   ├── package.json         # name "@docjob/db"
    │   ├── tsconfig.json
    │   ├── prisma/              # schema.prisma + migrations/ + seed.ts (moved from root)
    │   └── src/index.ts         # prisma singleton (moved from src/lib/prisma.ts) + re-export @prisma/client
    ├── config/
    │   ├── package.json         # name "@docjob/config"
    │   ├── tsconfig.json
    │   └── src/index.ts         # zod-validated env
    └── types/
        ├── package.json         # name "@docjob/types"
        ├── tsconfig.json
        └── src/index.ts         # scaffold; one real shared type to prove wiring
```

---

### Task 1: Root workspace scaffolding (pnpm + Turborepo)

Creates the monorepo shell at the repo root without moving the app yet. After this task the repo has workspace config but the app still lives at root and is temporarily NOT part of a workspace package — so we do the app move in Task 2 and only then install. This task ends by verifying the config files are syntactically valid (no install yet).

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.npmrc`
- Create: `tsconfig.base.json`
- Modify: `package.json` (root — becomes the workspace root)
- Delete (in Task 2 after move): `package-lock.json`

**Interfaces:**
- Produces: workspace globs `apps/*`, `packages/*`; turbo tasks `build`, `dev`, `lint`, `typecheck`, `test`, `db:generate`.

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 2: Create `.npmrc`**

```
# Hoist Prisma + Next so their CLIs resolve at the app; keep strict otherwise.
node-linker=hoisted
strict-peer-dependencies=false
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true
  }
}
```

- [ ] **Step 4: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "db:generate": { "cache": false },
    "build": {
      "dependsOn": ["^build", "^db:generate"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "typecheck": { "dependsOn": ["^db:generate"] },
    "lint": {},
    "test": { "dependsOn": ["^db:generate"] },
    "dev": { "cache": false, "persistent": true }
  }
}
```

- [ ] **Step 5: Replace root `package.json` with a workspace-root manifest**

Keep NOTHING app-specific at root. Save the current root `package.json` content first — it becomes `apps/web/package.json` in Task 2.

```json
{
  "name": "docjob",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "db:generate": "turbo db:generate"
  },
  "devDependencies": {
    "turbo": "^2.1.0"
  }
}
```

- [ ] **Step 6: Verify JSON/YAML validity (no install yet)**

Run: `node -e "require('./turbo.json'); require('./package.json'); require('./tsconfig.base.json'); console.log('json ok')"`
Expected: prints `json ok`.
Run: `node -e "const y=require('fs').readFileSync('pnpm-workspace.yaml','utf8'); if(!y.includes('apps/*'))process.exit(1); console.log('yaml ok')"`
Expected: prints `yaml ok`.

- [ ] **Step 7: Commit**

```bash
git add pnpm-workspace.yaml turbo.json .npmrc tsconfig.base.json package.json
git commit -m "chore(sp0): add pnpm+turborepo workspace root scaffolding"
```

---

### Task 2: Move the Next app into `apps/web`

Moves every app file into `apps/web` with `git mv` (preserves history), leaving `prisma/` at root for Task 3. Wires `apps/web/package.json` (the old root manifest, renamed) with workspace deps and adjusts its tsconfig to extend the base.

**Files:**
- Move (git mv → `apps/web/`): `src/`, `public/`, `scripts/`, `storage/`, `next.config.ts`, `next-env.d.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `components.json`, `vitest.config.ts`
- Create: `apps/web/package.json` (from saved root manifest)
- Create: `apps/web/tsconfig.json`
- Delete: root `package-lock.json`, root `tsconfig.json`, root `tsconfig.tsbuildinfo`

**Interfaces:**
- Consumes: root scaffolding from Task 1.
- Produces: workspace package `web` at `apps/web` with alias `@/* → ./src/*`.

- [ ] **Step 1: Create the app directory and move files**

```bash
mkdir -p apps/web
git mv src public scripts storage next.config.ts next-env.d.ts tailwind.config.ts postcss.config.mjs components.json vitest.config.ts apps/web/
```

- [ ] **Step 2: Create `apps/web/package.json`**

Use the ORIGINAL root `package.json` content saved in Task 1 Step 5, with these changes: `"name": "web"`, remove `"postinstall": "prisma generate"` (Prisma moves to `@docjob/db` in Task 3), and add workspace deps. The dependency/devDependency lists are otherwise copied verbatim from the original. Add to `dependencies`:

```json
"@docjob/db": "workspace:*",
"@docjob/config": "workspace:*",
"@docjob/types": "workspace:*"
```

Update the `scripts` block to (Prisma/seed scripts now delegate to `@docjob/db`, added in Task 3 — leave the `db:*` script bodies as-is for now; they are fixed in Task 3 Step 6):

```json
"scripts": {
  "dev": "next dev --turbopack",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run"
}
```

- [ ] **Step 3: Create `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "allowImportingTsExtensions": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", ".next"]
}
```

Note: `prisma/seed.ts` is removed from `include` — it moves to `@docjob/db` in Task 3.

- [ ] **Step 4: Delete the stale root files**

```bash
git rm package-lock.json tsconfig.json
rm -f tsconfig.tsbuildinfo
```

- [ ] **Step 5: Commit the move (install happens after Task 3)**

```bash
git add -A
git commit -m "chore(sp0): move Next app into apps/web"
```

---

### Task 3: Extract `@docjob/db` (Prisma client + schema)

Moves `prisma/` and the singleton into `packages/db`, updates the 5 `@/lib/prisma` import sites, and wires `db:generate` into Turbo. This is the first shared package and the first real install.

**Files:**
- Move (git mv → `packages/db/prisma/`): root `prisma/` (schema.prisma, migrations/, seed.ts)
- Move + rename: `apps/web/src/lib/prisma.ts` → `packages/db/src/index.ts`
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`
- Modify (5 files): `apps/web/src/lib/news.ts`, `apps/web/src/lib/embeddings.ts`, `apps/web/src/app/actions.ts`, `apps/web/src/app/cases/[subgroup]/[caseId]/page.tsx`, `apps/web/src/app/api/attachments/upload/route.ts`
- Modify: `apps/web/package.json` (db scripts), `packages/db/package.json` (seed config)

**Interfaces:**
- Produces: `import { prisma } from '@docjob/db'` (the singleton). `@docjob/db` also re-exports `@prisma/client` types via `export * from '@prisma/client'`.
- Consumes: Task 2's `apps/web` package.

- [ ] **Step 1: Move the prisma directory and the singleton**

```bash
mkdir -p packages/db/src
git mv prisma packages/db/prisma
git mv apps/web/src/lib/prisma.ts packages/db/src/index.ts
```

- [ ] **Step 2: Append a Prisma re-export to `packages/db/src/index.ts`**

The moved file already defines and exports `prisma`. Add this line at the end so consumers get Prisma types from the same package:

```typescript
export * from '@prisma/client';
```

- [ ] **Step 3: Create `packages/db/package.json`**

```json
{
  "name": "@docjob/db",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "db:generate": "prisma generate",
    "db:migrate": "dotenv -e ../../.env.local -e ../../.env -- prisma migrate dev",
    "db:deploy": "dotenv -e ../../.env.local -e ../../.env -- prisma migrate deploy",
    "db:studio": "dotenv -e ../../.env.local -e ../../.env -- prisma studio",
    "db:seed": "dotenv -e ../../.env.local -e ../../.env -- tsx prisma/seed.ts",
    "db:seed:prod": "tsx prisma/seed.ts"
  },
  "prisma": { "seed": "tsx prisma/seed.ts" },
  "dependencies": { "@prisma/client": "^5.22.0" },
  "devDependencies": {
    "prisma": "^5.22.0",
    "tsx": "^4.19.2",
    "dotenv-cli": "^7.4.4"
  }
}
```

- [ ] **Step 4: Create `packages/db/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src" },
  "include": ["src/**/*.ts", "prisma/seed.ts"]
}
```

- [ ] **Step 5: Update the 5 import sites**

In each of these files replace `from '@/lib/prisma'` with `from '@docjob/db'`:
- `apps/web/src/lib/news.ts`
- `apps/web/src/lib/embeddings.ts`
- `apps/web/src/app/actions.ts`
- `apps/web/src/app/cases/[subgroup]/[caseId]/page.tsx`
- `apps/web/src/app/api/attachments/upload/route.ts`

Run to confirm none remain:
Run: `grep -rn "@/lib/prisma" apps/web/src || echo "none left"`
Expected: prints `none left`.

- [ ] **Step 6: Point `apps/web` db scripts at the package**

In `apps/web/package.json` add these scripts so existing muscle-memory commands still work from the app (they delegate to the db workspace):

```json
"db:migrate": "pnpm --filter @docjob/db db:migrate",
"db:deploy": "pnpm --filter @docjob/db db:deploy",
"db:seed": "pnpm --filter @docjob/db db:seed",
"db:studio": "pnpm --filter @docjob/db db:studio",
"import:cases": "dotenv -e ../../.env.local -e ../../.env -- tsx scripts/import-cases.ts",
"embed:cases": "dotenv -e ../../.env.local -e ../../.env -- tsx scripts/embed-cases.ts"
```

Note: the maintenance scripts under `apps/web/scripts/` keep importing `@/…` and now `@docjob/db`; they run from the `apps/web` cwd so the relative `-e ../../.env*` paths resolve to repo root.

- [ ] **Step 7: Create `packages/config` and `packages/types` scaffolds**

Create `packages/config/package.json`:

```json
{
  "name": "@docjob/config",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "zod": "^3.24.2" }
}
```

Create `packages/config/tsconfig.json` (same shape as db's, `include: ["src/**/*.ts"]`).

Create `packages/config/src/index.ts`:

```typescript
import { z } from 'zod';

// Central env validation. Extend as packages/core lands (SP-1).
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
```

Create `packages/types/package.json` (name `@docjob/types`, deps `{ "zod": "^3.24.2" }`, same fields as config), `packages/types/tsconfig.json`, and `packages/types/src/index.ts`:

```typescript
// Shared cross-client types. Populated in SP-1 when packages/core is extracted.
export type Result<T> = { success: true; data: T } | { success: false; error: string };
```

- [ ] **Step 8: Install with pnpm and generate the Prisma client**

Run: `pnpm install`
Expected: resolves the 4 workspace packages, no peer/lockfile errors, writes `pnpm-lock.yaml`.
Run: `pnpm --filter @docjob/db db:generate`
Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 9: Verify typecheck across the workspace**

Run: `pnpm typecheck`
Expected: turbo runs `typecheck` in `apps/web` (after `@docjob/db#db:generate`) and PASSES with no errors. (`apps/web` currently sets `typescript.ignoreBuildErrors` for `next build`, but `tsc --noEmit` is run directly here and must be clean — it was clean before the move, and only 5 import specifiers changed.)

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(sp0): extract @docjob/db, @docjob/config, @docjob/types packages"
```

---

### Task 4: Full-build + test + boot verification gate

No new files — this task proves SP-0 preserved behavior. It is the deliverable's acceptance test.

**Files:** none (verification only).

**Interfaces:**
- Consumes: everything from Tasks 1–3.

- [ ] **Step 1: Clean build the whole workspace**

Run: `pnpm build`
Expected: turbo builds `@docjob/db` (generate) then `apps/web` (`next build`) to completion, no module-resolution errors for `@docjob/db|config|types`.

- [ ] **Step 2: Run the existing test suite**

Run: `pnpm test`
Expected: vitest runs the 2 existing tests (`apps/web/src/lib/email.test.ts`, `apps/web/src/lib/password-reset-tokens.test.ts`) and both PASS.

- [ ] **Step 3: Boot the dev server and hit a public route**

Run (background): `pnpm --filter web dev`
Then: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login`
Expected: `200`. Stop the dev server after.

- [ ] **Step 4: Confirm Prisma client resolves at runtime from the package**

Run: `node -e "const {prisma}=require('@docjob/db'); console.log(typeof prisma.user.findMany)"` from `apps/web` (or a quick tsx script). 
Expected: prints `function`. (Confirms the singleton export path works post-move.)

- [ ] **Step 5: Update repo docs for the new layout**

Modify `CLAUDE.md`: update the Commands section (commands now run via `pnpm` + turbo; `db:*` live in `@docjob/db`) and note the monorepo layout (`apps/web`, `packages/{db,config,types}`). Modify `DEPLOY.md` build step if it references the old single-package build (the Docker build context changes in SP-5, not here — only note it). Keep edits factual and minimal.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs(sp0): update CLAUDE.md/DEPLOY.md for monorepo layout; verify build+test+boot green"
```

---

## Notes for SP-1 (not in scope here)

- The Dockerfile + docker-compose still target the old single-package layout; updating them (and `output: 'standalone'` + a separate tooling image for the tsx scripts) is **SP-5**. SP-0 leaves them untouched — local `pnpm build` is the SP-0 gate, not a container build.
- `packages/types` and `packages/config` are intentionally thin scaffolds here; the bulk of shared zod schemas/types moves in SP-1 alongside `packages/core` and `packages/auth`.
- The `@/…` alias inside `apps/web` stays; SP-1 introduces `@docjob/core`/`@docjob/api`/`@docjob/auth` and migrates call sites incrementally.

---

## Self-Review

**Spec coverage (against SP-0 row of the master spec §11):** ✅ Turborepo+pnpm (Task 1), `apps/web` (Task 2), `packages/db`+`config`+`types` (Task 3), codemod of prisma import sites + per-package `prisma generate` in Turbo pipeline (Task 3), compat verified via build/test/boot (Task 4). The master spec's "codemod all `@/lib/prisma` imports … add per-package prisma generate … keep a compatibility barrel during the move, verify build, THEN peel out core/auth/api" is satisfied: only `@/lib/prisma` (5 sites) is codemodded; the broad `@/*` alias is preserved (compat by construction, no barrel needed); core/auth/api peeling is explicitly deferred to SP-1.

**Placeholder scan:** No TBD/TODO. Every config file and code file shows full content. The one "copy the original manifest" step (Task 2 Step 2) references a concrete saved artifact (root package.json from Task 1) rather than inventing dependency lists — deliberate, since reproducing ~70 exact dependency pins verbatim would be error-prone; the change-set (name, remove postinstall, add 3 workspace deps, trim scripts) is fully enumerated.

**Type consistency:** `@docjob/db` exports `prisma` (Task 3 Step 2/8) and is imported as `import { prisma } from '@docjob/db'` (Task 3 Step 5, Task 4 Step 4). `@docjob/config` exports `loadEnv`/`Env`; `@docjob/types` exports `Result<T>`. Package names `@docjob/{db,config,types}` are consistent across `pnpm-workspace.yaml` globs, each `package.json` `name`, and `apps/web` deps.
