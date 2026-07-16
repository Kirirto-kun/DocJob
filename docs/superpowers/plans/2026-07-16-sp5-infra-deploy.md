# SP-5: Infrastructure & Deployment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make DocJob deployable and operable on a single VPS (and ready to scale later) — a correct monorepo-aware production Docker image (Next.js standalone), a docker-compose stack (Postgres/pgvector + web + embed-worker + optional Redis), a health endpoint + graceful shutdown, opt-in Redis-backed rate-limiters/cache for multi-instance scale, and the surrounding ops (Nginx/TLS, CI, backups, a deploy runbook). The **user deploys themselves** — this SP produces correct, verified infrastructure code + a runbook; it does not perform the deploy.

**Architecture:** The existing root `Dockerfile`/`docker-compose.yml` are **stale pre-monorepo** (npm single-package). This SP rewrites them for the pnpm + Turborepo workspace using Next.js `output: 'standalone'`. One image serves both the **web** service (`next start` standalone, runs `prisma migrate deploy` on boot) and the **worker** service (same image, CMD runs the SP-3 `reembed:cases --loop` embed-durability sweep). Rate-limiters and the query-embedding cache already sit behind interfaces (`AttemptLimiter`, `createFixedWindowLimiter`, `QueryEmbeddingCache`) explicitly designed for a Redis swap — SP-5 adds Redis-backed adapters selected at runtime when `REDIS_URL` is set (else the current in-memory impls, which are correct for a single instance).

**Tech Stack:** Docker + docker-compose, Next.js 15 standalone, pnpm/turbo, Postgres 16 + pgvector, `ioredis` (opt-in), Nginx + certbot (host), GitHub Actions. `@node-rs/argon2` + Prisma engines drive the base-image choice.

## Global Constraints

- **App green after every code task:** `pnpm typecheck` + `pnpm test` + `pnpm build`. Config/docs-only tasks verify their artifact (e.g. `docker compose config`, `next build` produces `.next/standalone`, `docker build` succeeds where feasible).
- **Don't break the dev workflow:** the repo-root-dotenv dev scripts, the `docker compose --env-file .env.local up -d postgres` dev-Postgres flow, and the `POSTGRES_HOST_PORT` default (5433, this machine uses 5434) must keep working. Production Docker injects env directly (no dotenv autoload).
- **Secrets never committed:** `.env.example` documents every var; real values live in the user's `.env` on the VPS. No secret in any committed file, Dockerfile, or compose default beyond safe dev fallbacks.
- **Boundary discipline unchanged:** `@docjob/core`/`@docjob/api` stay transport-agnostic; the Redis adapters live behind the existing interfaces (a Redis client is infra, injected — core/api import only the interface). `packages/*/boundary.test.ts` must stay green.
- **Backward-compatible opt-in:** Redis is OFF by default (no `REDIS_URL` → in-memory, single-VPS works). Nothing in T1–T3 (the deploy-critical path) requires Redis.
- **Brand "DocJob".** Prisma lives in `packages/db`; migrations in `packages/db/prisma/migrations`; `db:deploy` = `prisma migrate deploy`. The embed worker script is `apps/web/scripts/reembed-worker.ts` (`reembed:cases`).
- **The user runs the deploy.** Every task that produces ops config MUST also update the deploy runbook (T5's `DEPLOY.md`) so the steps are followable. Call out anything that needs the user's server/domain/accounts.

## Current-state facts (from survey)

- `next.config.ts`: no `output: 'standalone'`. Root `Dockerfile` + `docker-compose.yml`: stale (npm, single-package, `COPY src ./src`, `npm run build/start`; compose has only postgres + web, no worker/redis, missing `PASSWORD_RESET_URL_BASE`/contact envs). No `.github/workflows`. No health route, no structured logging.
- Injection points for the Redis swap: `packages/auth/src/login.service.ts` (`defaultLimiter = createInMemoryLimiter()`, injectable) + the web login route `apps/web/src/app/api/auth/login/route.ts` (`createInMemoryLimiter()`); `packages/api/src/routers/search.ts` (`createFixedWindowLimiter()` module singleton); `packages/core/src/search/query-cache.ts` (`defaultCache = createInMemoryQueryCache()`).
- Build: `pnpm --filter web build` (turbo runs `@docjob/db db:generate` first). Prod DB: `pnpm --filter @docjob/db db:deploy` (`prisma migrate deploy`). Worker: `pnpm --filter web reembed:cases -- --loop` (the script reads `--loop` from argv).

---

### Task 1: Next.js standalone + monorepo production Dockerfile (web) + argon2/prisma base-image verification

**Files:**
- Modify: `apps/web/next.config.ts` (add `output: 'standalone'` + `outputFileTracingRoot`)
- Rewrite: `Dockerfile` (repo root)
- Create: `.dockerignore` (repo root, if absent/stale)
- Modify: `packages/db/prisma/schema.prisma` (add the Docker `binaryTargets` to the `generator client`)

- [ ] **Step 1: Standalone output.** In `apps/web/next.config.ts`, add to `nextConfig`:
```ts
  output: 'standalone',
  outputFileTracingRoot: require('path').join(__dirname, '../../'),
```
(In a pnpm monorepo, `outputFileTracingRoot` at the workspace root is REQUIRED so `next build` traces + copies the symlinked workspace deps into `.next/standalone`. Use an import-compatible form if the file is ESM — `import path from 'node:path'` + `path.join(...)`.)

- [ ] **Step 2: Verify the standalone build locally FIRST** (before Docker): `pnpm --filter web build` and confirm `apps/web/.next/standalone/apps/web/server.js` (and `node_modules` traced) exist. Fix the tracing root if the standalone dir is missing workspace packages. This is the cheapest verification and de-risks the Dockerfile.

- [ ] **Step 3: Prisma binary targets.** In `packages/db/prisma/schema.prisma`, set the generator to emit the engine for the chosen Docker base:
```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "debian-openssl-3.0.x"]
}
```
(Use `debian-openssl-3.0.x` for a `node:20-bookworm-slim` runner. If you choose an alpine base instead, use `linux-musl-openssl-3.0.x` and add `libc6-compat` — but **debian-slim is recommended** because `@node-rs/argon2` needs its glibc `linux-x64-gnu` prebuild, and getting the `linux-x64-musl` optional dep installed through pnpm in a cross-platform Docker build is a known footgun. Justify the base choice in the report.)

- [ ] **Step 4: Rewrite `Dockerfile`** for the pnpm monorepo + standalone. Multi-stage:
```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS build
# Copy workspace manifests first for install-layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY packages/api/package.json packages/api/
COPY packages/auth/package.json packages/auth/
COPY packages/types/package.json packages/types/
COPY packages/config/package.json packages/config/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @docjob/db db:generate
RUN pnpm --filter web build

FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
# Standalone server + static + public
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
# Prisma: schema + migrations + the generated client/engine + a pnpm to run db:deploy
COPY --from=build /app/packages/db ./packages/db
COPY --from=build /app/node_modules/.pnpm ./node_modules/.pnpm
RUN mkdir -p /app/storage/uploads && chown -R nextjs:nodejs /app/storage
USER nextjs
EXPOSE 3000
# migrate then start the standalone server
CMD ["sh","-c","node packages/db/node_modules/prisma/build/index.js migrate deploy --schema packages/db/prisma/schema.prisma && node apps/web/server.js"]
```
This is a STARTING POINT — the exact copy paths for the standalone output + how to invoke `prisma migrate deploy` in the runner (without a full dev install) will need adjustment against what `next build` actually emits and how Prisma is laid out under `.pnpm`. **The implementer must iterate the Dockerfile against a real `docker build` until the image builds and boots.** Prefer running `prisma migrate deploy` via a small entrypoint that has the Prisma CLI available (either keep `packages/db`'s `prisma` devDep in the runner, or add a tiny migrate stage). Document the final working layout.

- [ ] **Step 5: `.dockerignore`** — ignore `node_modules`, `.next`, `.git`, `**/*.test.*`, `apps/mobile`, `.superpowers`, `docs`, `.env*`, `storage`, coverage, etc., so the build context is lean.

- [ ] **Step 6: Build + boot verification** (Docker IS available — `docker version` 29.x). `docker build -t docjob-web .` must succeed. Then smoke it: `docker run --rm --env DATABASE_URL=... --env AUTH_SECRET=... -p 3000:3000 docjob-web` against the dev Postgres (host network or a shared compose network) — confirm it runs `migrate deploy` + serves. **Critically verify `@node-rs/argon2` loads** (hit `/api/auth/login` once, or `node -e "require('@node-rs/argon2')"` inside the image) — a missing musl/gnu binary is the #1 base-image failure. If the full build is too slow/heavy for this environment, at minimum get `docker build` through the install+generate+build stages and verify argon2 resolves; document any step you couldn't run here for the user to complete on their VPS.

- [ ] **Step 7: Gate + commit.** `pnpm typecheck && pnpm build` (standalone) green.
```bash
git add apps/web/next.config.ts Dockerfile .dockerignore packages/db/prisma/schema.prisma
git commit -m "feat(sp5): Next standalone output + monorepo production Dockerfile (pnpm/turbo, prisma+argon2 verified)"
```

---

### Task 2: docker-compose stack — postgres + web + embed-worker + optional redis

**Files:**
- Rewrite: `docker-compose.yml` (repo root)
- Modify: `.env.example` (add every production var incl. SP-4a's `PASSWORD_RESET_URL_BASE`, contact, and `REDIS_URL`)
- Modify: root `package.json` (the `docker:up`/`docker:down` aliases stay; add `docker:logs` if useful)

- [ ] **Step 1: Rewrite `docker-compose.yml`** with 4 services (redis behind a compose `profile` so it's opt-in):
  - `postgres`: `pgvector/pgvector:pg16` (unchanged — keep the volume, healthcheck, `POSTGRES_HOST_PORT` default).
  - `web`: `build: { context: ., dockerfile: Dockerfile }`, `depends_on: postgres (healthy)`, all env vars (DATABASE_URL pointing at the `postgres` service, `AUTH_SECRET`, `AUTH_URL`, `PASSWORD_RESET_URL_BASE`, `UPLOAD_DIR=/app/storage/uploads`, `OPENAI_*`, `RESEND_API_KEY`/`EMAIL_FROM`, `GOOGLE_SITE_VERIFICATION`/`YANDEX_VERIFICATION`, `REDIS_URL` (optional), `SITE_URL`), `ports: 127.0.0.1:3000:3000` (bind to loopback — Nginx on the host proxies; do NOT expose 3000 publicly), `uploads` volume, a healthcheck hitting `/api/health` (T3), `restart: unless-stopped`.
  - `worker`: same `build`/image, `depends_on: postgres (healthy)`, the SAME DB/OPENAI env, `command: ["pnpm","--filter","web","reembed:cases","--","--loop"]` (or a direct `node`/`tsx` invocation of `reembed-worker.ts --loop` that works in the standalone image — verify the worker can run in the runner image; if the standalone image lacks `tsx`, provide a compiled/`node`-runnable entry or keep `tsx` available for the worker). It needs `DATABASE_URL` + `OPENAI_API_KEY` (no uploads, no port). `restart: unless-stopped`. Env `REEMBED_INTERVAL_MS` optional.
  - `redis` (under `profiles: ["redis"]`): `redis:7-alpine`, `restart: unless-stopped`, an `appendonly` volume, healthcheck `redis-cli ping`. Only starts with `docker compose --profile redis up`.
  - `volumes: postgres_data, uploads, redis_data`.

- [ ] **Step 2: Worker-in-image check.** Confirm the `worker` command actually runs in the T1 image. The `reembed-worker.ts` is a `tsx` script; the standalone runner image may not include `tsx`/the web `src`. Resolve: either (a) keep `tsx` + the script + `@docjob/core` reachable in the image for the worker, or (b) add a tiny compiled worker entry. Document the chosen approach. The worker must import `@docjob/core`'s `reindex.reembedDirtyCases` and loop.

- [ ] **Step 3: `.env.example` completeness.** Ensure EVERY runtime var the app/worker reads is documented with a comment + a safe placeholder: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_SECRET_PREVIOUS`, `AUTH_URL`, `PASSWORD_RESET_URL_BASE`, `UPLOAD_DIR`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `RESEND_API_KEY`, `EMAIL_FROM`, `SITE_URL`, `GOOGLE_SITE_VERIFICATION`, `YANDEX_VERIFICATION`, `REDIS_URL` (optional), `POSTGRES_PASSWORD`, `POSTGRES_HOST_PORT`, `REEMBED_INTERVAL_MS`. Grep the codebase for `process.env.` to catch any missing var.

- [ ] **Step 4: Verify** `docker compose config` validates (parses + resolves env); `docker compose --profile redis config` includes redis; `docker compose config` (no profile) excludes it. If feasible, `docker compose up -d postgres worker` (with a key) and confirm the worker boots + logs a sweep (`[reembed] processed=…`). Commit:
```bash
git add docker-compose.yml .env.example package.json
git commit -m "feat(sp5): compose stack — postgres + web + embed-worker + opt-in redis; complete .env.example"
```

---

### Task 3: Health endpoint + structured request logging + graceful shutdown

**Files:**
- Create: `apps/web/src/app/api/health/route.ts` (+ a small test if the repo has a route-test pattern)
- Create/modify: a light logger (`apps/web/src/lib/logger.ts`) + wire request-id logging where cheap
- Modify: `docker-compose.yml` (web healthcheck → `/api/health`) — coordinate with T2

- [ ] **Step 1: `/api/health`** (`runtime = 'nodejs'`): a GET that runs a cheap DB liveness check (`SELECT 1` via `prisma.$queryRaw`) with a short timeout; returns `200 { status: 'ok', db: 'up', ts }` or `503 { status: 'degraded', db: 'down' }`. NO auth (must be in the middleware public list — add `/api/health` to `src/middleware.ts` public paths). Keep it cheap (no heavy queries) — it's polled by Docker + Nginx + uptime monitors.
- [ ] **Step 2: Structured logging.** Add a minimal `logger` (pino if you add the dep, or a tiny JSON console wrapper) with a request-id. At minimum: log unhandled API errors + the health status transitions. Don't over-build — a lightweight structured logger the ops can grep is enough. (The tRPC layer already maps DomainError→TRPCError; add request-id propagation if cheap.)
- [ ] **Step 3: Graceful shutdown.** Ensure the standalone server + the worker handle `SIGTERM` cleanly (Next standalone does; the worker loop should stop its interval + `prisma.$disconnect()` on SIGTERM so `docker compose down` / a rolling restart doesn't sever an in-flight embed). Add a SIGTERM handler to `reembed-worker.ts` if absent.
- [ ] **Step 4: Wire the web healthcheck** in `docker-compose.yml` (`test: curl -fsS http://localhost:3000/api/health || exit 1`, sane interval/retries/start_period). Verify: `curl localhost:3000/api/health` returns 200 against a live DB, 503 when DB is down.
- [ ] **Step 5: Gate + commit.** `pnpm typecheck && pnpm test && pnpm build`.
```bash
git commit -am "feat(sp5): /api/health (DB liveness) + structured request logging + worker graceful shutdown"
```

---

### Task 4: Opt-in Redis-backed limiters + query cache + reset-procedure rate-limit

**Files:**
- Create: `packages/config/src/redis.ts` (or a small shared module) — a lazily-constructed `ioredis` client from `REDIS_URL` (null when unset)
- Create: Redis adapters implementing `AttemptLimiter` (auth), the fixed-window limiter (api), `QueryEmbeddingCache` (core) — each behind its existing interface
- Modify: the 4 injection points to select Redis when available, else in-memory
- Modify: `packages/api/src/routers/users.ts` — add a rate-limit to `requestPasswordReset` (the deferred SP-4a hardening)
- Tests: unit for each adapter (mock ioredis) + the in-memory fallback path

- [ ] **Step 1: Redis client** — `packages/config` gains a `getRedis(): Redis | null` (lazy `ioredis` from `process.env.REDIS_URL`, memoized, returns `null` if unset). `ioredis` is a dependency of the packages that use it (auth/api/core) OR of `@docjob/config` which they already depend on — keep it out of the RN bundle path (mobile never imports these). Confirm `@docjob/core`/`auth`/`api` may take a runtime infra dep (they're server-only) without breaking `boundary.test.ts` (ioredis is not `next`/`react`/`@/*` — allowed).
- [ ] **Step 2: `AttemptLimiter` Redis adapter** (sliding-window via a Redis sorted-set or INCR+EXPIRE) implementing the exact `AttemptLimiter` interface (`check`/`record`). Select it in `login.service.ts`'s `defaultLimiter` and the web login route when `getRedis()` is non-null; else the current `createInMemoryLimiter()`. TDD with a mocked ioredis (assert the window/lock semantics match the in-memory one).
- [ ] **Step 3: Search fixed-window Redis adapter** — same shape as `createFixedWindowLimiter().take(key)`, Redis INCR+EXPIRE. Select in `packages/api/src/routers/search.ts` when Redis is available.
- [ ] **Step 4: `QueryEmbeddingCache` Redis adapter** (`get`/`set` with TTL via Redis GET/SETEX of the JSON-encoded vector). Select in `query-cache.ts`'s default when Redis is available.
- [ ] **Step 5: Reset-procedure rate-limit** (deferred SP-4a hardening) — add a per-IP+per-email limiter to `users.requestPasswordReset` (reuse the fixed-window limiter, Redis-or-memory), so reset requests are throttled like login. Keep the anti-enumeration `{sent:true}` response even when throttled (don't reveal throttling differently for known vs unknown emails). Test it.
- [ ] **Step 6: Gate + commit.** All adapters fall back to in-memory when `REDIS_URL` is unset (the default single-VPS path — assert this in tests). `pnpm typecheck && pnpm test && pnpm build`.
```bash
git commit -am "feat(sp5): opt-in Redis-backed limiters + query cache (multi-instance) + reset rate-limit"
```

---

### Task 5: Nginx + TLS + CI/CD + backups + monitoring + DEPLOY.md runbook (ops config + docs)

**Files:**
- Create: `deploy/nginx/docjob.conf` (host reverse-proxy config)
- Create: `.github/workflows/ci.yml` (typecheck + test + build)
- Create: `deploy/backup/{pg-backup.sh,uploads-backup.sh}` + a cron example
- Create: `DEPLOY.md` (the runbook — the single source of truth for the user's deploy)

- [ ] **Step 1: Nginx** `deploy/nginx/docjob.conf` — `server` block: proxy_pass to `http://127.0.0.1:3000`; `proxy_set_header` Host/X-Forwarded-Proto/X-Forwarded-For/X-Real-IP (needed for the CSRF `allowedOrigin` host fallback + login IP rate-limit); `client_max_body_size 30m` (the 25MB attachment cap + overhead); gzip; security headers (HSTS, X-Content-Type-Options, X-Frame-Options/frame-ancestors, Referrer-Policy); a `location /api/health` note for the load balancer. Include the 80→443 redirect + certbot ACME `.well-known` passthrough. Comment where the cert paths go.
- [ ] **Step 2: TLS** — document certbot usage (`certbot --nginx -d docjob.kz -d www.docjob.kz`) in `DEPLOY.md`; the nginx conf references the standard Let's Encrypt cert paths.
- [ ] **Step 3: CI** `.github/workflows/ci.yml` — on push/PR: checkout, setup-node + pnpm, `pnpm install --frozen-lockfile`, a Postgres service (pgvector) with the extensions, `pnpm --filter @docjob/db db:deploy` against it, `pnpm typecheck`, `pnpm test`, `pnpm build`. (The tests need a real Postgres — wire the `pgvector/pgvector:pg16` service + `DATABASE_URL` + `AUTH_SECRET`/dummy `OPENAI_API_KEY` env; the search tests tolerate a missing/invalid OpenAI key via the lexical fallback.) Optionally a `docker build` job. Do NOT add a deploy/publish job (the user deploys manually) unless trivial + clearly gated.
- [ ] **Step 4: Backups** `deploy/backup/pg-backup.sh` (`pg_dump` of the `postgres` service to a timestamped, rotated dump; `docker compose exec -T postgres pg_dump ...`), `uploads-backup.sh` (tar the `uploads` volume), + a crontab example (daily, keep N). Document restore steps in `DEPLOY.md`.
- [ ] **Step 5: `DEPLOY.md` runbook** — the deliverable that lets the user deploy. Cover: prerequisites (VPS, Docker, domain, DNS); first-time setup (clone, `.env` from `.env.example` with which values matter, generate `AUTH_SECRET`); `docker compose up -d` (with/without the `redis` profile); the one-time `db:seed:prod` (admin) + `import:cases` + `embed:cases` bootstrap; Nginx + certbot; the worker; backups/restore; `AUTH_SECRET` rotation (the `AUTH_SECRET_PREVIOUS` window); scaling to Redis + multiple web instances; health monitoring; log locations; and an explicit "what needs YOUR accounts/domain" list (domain+DNS, TLS cert, OpenAI key, Resend key, and — for mobile — the EAS/store accounts from `apps/mobile/README.md`).
- [ ] **Step 6: Verify + commit.** `docker compose config` still valid; `.github/workflows/ci.yml` is valid YAML (`yamllint` or a parse check); the backup scripts are `sh`-lint-clean (`sh -n`). Nothing here changes app code, so no app test run needed beyond confirming the repo is unchanged functionally.
```bash
git add deploy .github DEPLOY.md
git commit -m "feat(sp5): nginx+TLS + CI + backups + monitoring + DEPLOY.md runbook"
```

---

## Self-Review

**Spec §9 coverage:** standalone build + monorepo Dockerfile (T1) · compose postgres+web+worker+redis (T2) · health + logging + graceful shutdown (T3) · opt-in Redis limiters/cache for scale + reset rate-limit deferred-item (T4) · Nginx/TLS + CI + backups + monitoring + runbook (T5). Deferred SP-4a hardenings closed: reset-proc rate-limit (T4); the `@node-rs/argon2` alpine/base verification (T1). ✅

**Deploy-critical first:** T1→T2→T3 make the stack deployable; T4 (Redis) is an opt-in scale upgrade that doesn't block a single-VPS deploy; T5 is the ops wrapper + runbook. If effort runs long, the deploy-critical path lands first.

**No secrets committed:** T2/T5 use `.env.example` + placeholders only; `DEPLOY.md` tells the user which real values to supply.

**Type/interface consistency:** the Redis adapters (T4) implement the EXACT existing interfaces (`AttemptLimiter.check/record`, `.take(key)`, `QueryEmbeddingCache.get/set`) so the injection points swap with no call-site change; in-memory remains the `REDIS_URL`-unset default (asserted in tests).

## Risks
- **Standalone + pnpm monorepo tracing** is fiddly — `outputFileTracingRoot` must be the workspace root or the standalone server misses workspace deps at runtime. T1 Step 2 verifies the standalone output BEFORE Docker.
- **argon2 + Prisma engine on the base image** is the top Docker risk — debian-slim (glibc) sidesteps the alpine/musl argon2 footgun; `binaryTargets` must match the base. T1 Step 6 verifies argon2 loads in the built image.
- **Worker in the standalone image:** `reembed-worker.ts` is a `tsx` script; the slim runner may lack `tsx`/`src`. T2 Step 2 resolves this explicitly (keep tsx+script reachable, or a node-runnable entry) — a worker that can't start is a silent durability gap.
- **CI needs a real Postgres with pgvector + the migrations applied** — the integration tests (core/api/web) hit Postgres; the workflow must stand up `pgvector/pgvector:pg16` + `db:deploy` before `pnpm test`.
- **Docker build may be slow/heavy in this authoring environment** — verify as far as feasible here (standalone build always; docker build + argon2 load if it completes); clearly hand any unrunnable step to the user's VPS in `DEPLOY.md`.
