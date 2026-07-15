# SP-3: Hybrid Semantic Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the hero AI-search from a single pgvector-KNN into a durable **hybrid** search — Russian full-text (FTS) + trigram lexical arm fused with the semantic (vector) arm via Reciprocal-Rank-Fusion — backed by a reliable embed-on-write pipeline (dirty-flag + background re-index worker with a concurrency guard), a query-embedding cache, and search rate-limiting.

**Architecture:** Postgres does the heavy lifting: a **generated `tsvector` column** (`searchDoc`, `russian` config over the case's flat fields + flattened BlockNote body) with a GIN index, plus `pg_trgm` GIN indexes for typo-tolerant name matching, alongside the existing HNSW `vector(1536)` index. `@docjob/core`'s `searchCases` runs the two arms in parallel, fuses them with RRF, applies intent-derived boosts + optional filters (over-fetch + post-filter to dodge the HNSW-`WHERE` recall trap), and returns ranked `SearchHit`s. Writes only flip `Case.embeddingDirty = true` and best-effort kick an inline re-embed; a `reembedDirtyCases` worker is the durability safety-net, guarded by `bodyHash` + an `updatedAt`-snapshot optimistic check so it never clobbers a newer edit or loops on a permanently-failing row.

**Tech Stack:** Postgres 16 + pgvector (HNSW) + `pg_trgm` + `to_tsvector('russian')`/`jsonb_to_tsvector`, Prisma (hand-written migration for the generated column, mirroring `20260529000001_add_case_embedding_pgvector`), OpenAI `text-embedding-3-small` (1536), `@docjob/core` (vitest against the real dev Postgres), `@docjob/api` (tRPC `search` router), `apps/web` `ai-search` page.

## Global Constraints

- **Brand "DocJob"** in all user-facing copy (never "MEDIZO").
- **App green after every task:** `pnpm typecheck` (all packages), `pnpm test` (all packages), `pnpm build` (apps/web). Browser-smoke the AI-search screen for tasks that touch it (T4, T6).
- **Dark theme first** (the app forces `className="dark"`); shadcn/ui + Tailwind 3; icons `lucide-react`; `cn()` from `@/lib/utils`.
- **Core stays transport-agnostic** — `packages/core/src/boundary.test.ts` forbids `next`/`react`/`@/*`/`server-only` imports in `@docjob/core`. New core files obey it.
- **Actor model** — every core function takes `Actor | null` first; `searchCases` requires `assertApproved` (any approved user, not admin-only) — unchanged.
- **Graceful degradation is mandatory:** a missing `OPENAI_API_KEY`, OpenAI 429/quota/network error, or zero embedded cases must NEVER throw to the user — the search degrades to lexical-only (FTS), then substring, always returning an array. This preserves the SP-1b/SP-2 contract that `searchCases` never crashes the page.
- **Local env caveat:** core/db scripts load env via `dotenv -e ../../.env.local -e ../../.env`. Dev Postgres is the docker `postgres` service on host port **5434** (this machine — `DATABASE_URL` already points there). Bring it up with `docker compose --env-file .env.local up -d postgres` if down.
- **Embedding model is fixed:** `text-embedding-3-small`, `EMBEDDING_DIMS = 1536` (matches the `vector(1536)` column) — do not change it; a dimension change would require re-embedding every row.

## Product decision baked into this plan (spec §6 "«генерации нет» — сверить")

**KEEP the LLM intent-extraction step, reframed.** The spec offers: drop it (accept a recall trade-off) or keep it and drop the "no hallucination" claim. We keep it because it materially improves the hero feature (it refines the query for the vector arm and extracts `tags`/`specialty`/`subgroup` used for re-ranking boosts), but:
- It is **best-effort and non-blocking**: the **lexical arm always runs on the RAW query**, so if OpenAI is unavailable the search still works (FTS), no substring fallback needed for the common case.
- Honest framing for UX copy: the LLM is used **only for query understanding**; **returned cases are curated library content, never generated** — so there is no risk of hallucinated medical content. (This is the line to use anywhere the UI claims AI safety.)

---

## File Structure

**`packages/db`**
- `prisma/schema.prisma` — add `bodyHash String?` and `searchDoc Unsupported("tsvector")?` to `Case` (T1).
- `prisma/migrations/<ts>_sp3_hybrid_search_fts/migration.sql` — hand-written: `pg_trgm`, `bodyHash`, generated `searchDoc`, GIN + trgm indexes (T1).

**`packages/core/src/search`**
- `embeddings.ts` — add `hashEmbeddingText`; add `reembedCase`; keep `upsertCaseEmbedding` as a thin back-compat alias (T2).
- `reindex.service.ts` (new) — `reembedDirtyCases` sweep worker (T3).
- `lexical.ts` (new) — `lexicalSearch` (FTS + trgm) raw-SQL query (T4).
- `fusion.ts` (new) — `reciprocalRankFusion` pure function + `SearchHit`/`MatchSignal` types (T4).
- `query-cache.ts` (new) — `QueryEmbeddingCache` interface + `createInMemoryQueryCache` + `embedQueryCached` (T5).
- `search.service.ts` — rewrite `searchCases` to fuse both arms, return `SearchHit[]` (T4); wire the cache (T5).
- `*.test.ts` alongside each (unit for pure fns, integration against real Postgres for SQL).

**`packages/core/src`**
- `cases/case.service.ts` — `updateCase` sets `embeddingDirty: true` (T2).
- `index.ts` — re-export new top-level helpers where the existing pattern does (T2–T5).

**`packages/api/src`**
- `rate-limit.ts` (new) — minimal fixed-window limiter (T5).
- `routers/cases.ts` — swap the fire-and-forget `upsertCaseEmbedding` for `reembedCase` (T3).
- `routers/search.ts` — rate-limit + return `SearchHit[]` (T4/T5).

**`apps/web`**
- `scripts/reembed-worker.ts` (new) — runnable sweep (one-shot / `--loop`) (T3).
- `scripts/embed-cases.ts` — target `embeddingDirty OR embedding IS NULL` (T3).
- `package.json` — add `reembed:cases` script (T3).
- `src/app/ai-search/**` — consume `SearchHit`, render why-matched badge + snippet + zero-result state (T4 minimal parity, T6 polish).

---

### Task 1: FTS migration — `pg_trgm` + generated `searchDoc` tsvector + `bodyHash` + indexes

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (Case model — add two fields)
- Create: `packages/db/prisma/migrations/<timestamp>_sp3_hybrid_search_fts/migration.sql`
- Create: `packages/core/src/search/fts.integration.test.ts`

**Interfaces:**
- Produces: a `Case."searchDoc"` `tsvector` column (generated, STORED) + `Case_searchDoc_idx` (GIN); `Case_name_trgm_idx` / `Case_teaser_trgm_idx` (GIN `gin_trgm_ops`); `Case."bodyHash"` `text` nullable. Later tasks query `searchDoc` via raw SQL and write `bodyHash` from the re-embed path.

**Why generated + hand-written SQL:** Prisma can't express a `GENERATED ALWAYS AS (...) STORED` column or GIN indexes on `Unsupported` types — same situation as the existing pgvector HNSW index, which lives only in migration `20260529000001_add_case_embedding_pgvector` and is declared in the schema as `embedding Unsupported("vector(1536)")?`. We mirror that exactly: declare `searchDoc` as `Unsupported("tsvector")?` so Prisma's drift-check treats the column as present and never tries to drop it, but author the real DDL by hand.

- [ ] **Step 1: Add the two fields to `schema.prisma`.** In `model Case`, directly after the `embedding` line, add `bodyHash` (near the scalar fields) and `searchDoc`:

```prisma
  body                Json        @default("{\"blocks\":[]}")
  bodyHash            String?
  embeddingDirty      Boolean     @default(true)
  embedding           Unsupported("vector(1536)")?
  searchDoc           Unsupported("tsvector")?
```

- [ ] **Step 2: Create the migration skeleton (create-only, so Prisma doesn't auto-apply a wrong diff).**

Run: `pnpm --filter @docjob/db exec -- dotenv -e ../../.env.local -e ../../.env -- prisma migrate dev --create-only --name sp3_hybrid_search_fts`

This creates `packages/db/prisma/migrations/<timestamp>_sp3_hybrid_search_fts/migration.sql` with Prisma's naive guess (it will emit plain `ADD COLUMN "bodyHash" TEXT` and `ADD COLUMN "searchDoc" tsvector`, and will NOT add the extension/generated expression/indexes). Do not apply it yet.

- [ ] **Step 3: Replace the generated `migration.sql` with the hand-written DDL** (overwrite the file entirely):

```sql
-- SP-3: hybrid search — trigram + Russian FTS generated column + bodyHash

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Durability guard for embed-on-write (SP-3 T2): hash of the embedded text.
ALTER TABLE "Case" ADD COLUMN "bodyHash" TEXT;

-- Lexical search document: Russian FTS over the case's flat fields + every
-- string value inside the BlockNote body JSON. All inputs are IMMUTABLE
-- (to_tsvector/jsonb_to_tsvector with a constant regconfig, array_to_string,
-- coalesce, ||) so the column can be GENERATED ... STORED.
ALTER TABLE "Case" ADD COLUMN "searchDoc" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('russian',
      coalesce("name", '') || ' ' ||
      coalesce("teaser", '') || ' ' ||
      coalesce("primaryCondition", '') || ' ' ||
      coalesce("specialty", '') || ' ' ||
      coalesce("subgroup", '') || ' ' ||
      array_to_string("tags", ' ')
    ) || jsonb_to_tsvector('russian', "body", '["string"]')
  ) STORED;

-- GIN over the FTS document (the lexical arm's @@ match + ts_rank).
CREATE INDEX "Case_searchDoc_idx" ON "Case" USING GIN ("searchDoc");

-- Trigram GIN for typo-tolerant / language-agnostic (incl. Kazakh) matching
-- on the two most search-relevant short fields via the `%` similarity op.
CREATE INDEX "Case_name_trgm_idx" ON "Case" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "Case_teaser_trgm_idx" ON "Case" USING GIN ("teaser" gin_trgm_ops);
```

- [ ] **Step 4: Apply the migration.**

Run: `pnpm --filter @docjob/db exec -- dotenv -e ../../.env.local -e ../../.env -- prisma migrate deploy`
Then regenerate the client: `pnpm --filter @docjob/db exec -- prisma generate`
Expected: migration `sp3_hybrid_search_fts` applied, no error.

- [ ] **Step 5: Write the failing integration test** at `packages/core/src/search/fts.integration.test.ts`:

```ts
/**
 * Integration test for the SP-3 FTS migration — runs against the real dev
 * Postgres (DATABASE_URL from dotenv, same harness as search.service.test.ts).
 * Seeds a throwaway case, asserts the generated `searchDoc` populated itself
 * and the GIN/trgm indexes exist and match.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '@docjob/db';

describe('SP-3 FTS migration (integration, real Postgres)', () => {
  const ids: string[] = [];

  afterAll(async () => {
    if (ids.length) await prisma.case.deleteMany({ where: { id: { in: ids } } });
  });

  it('created the searchDoc + trigram indexes', async () => {
    const idx = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'Case'
    `;
    const names = idx.map((r) => r.indexname);
    expect(names).toContain('Case_searchDoc_idx');
    expect(names).toContain('Case_name_trgm_idx');
    expect(names).toContain('Case_teaser_trgm_idx');
  });

  it('auto-populates searchDoc from flat fields + body and matches an FTS query', async () => {
    // Reuse the seeded admin (dev DB is seeded — `pnpm --filter @docjob/db db:seed`).
    const author = await prisma.user.findFirstOrThrow({ select: { id: true } });
    const c = await prisma.case.create({
      data: {
        authorId: author.id,
        name: 'Пневмония у пожилого пациента',
        teaser: 'Кашель и лихорадка',
        specialty: 'Пульмонология',
        tags: ['пневмония', 'антибиотики'],
        body: { blocks: [{ type: 'paragraph', content: [{ type: 'text', text: 'рентген грудной клетки показал инфильтрат' }] }] },
      },
      select: { id: true },
    });
    ids.push(c.id);

    // Matches a flat-field term.
    const byField = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Case" WHERE id = ${c.id} AND "searchDoc" @@ plainto_tsquery('russian', 'пневмония')
    `;
    expect(byField).toHaveLength(1);

    // Matches a term that only exists inside the BlockNote body JSON.
    const byBody = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Case" WHERE id = ${c.id} AND "searchDoc" @@ plainto_tsquery('russian', 'инфильтрат')
    `;
    expect(byBody).toHaveLength(1);

    // pg_trgm is usable: similarity() returns > 0 for overlapping strings
    // (deterministic — shared trigrams — unlike a threshold-dependent `%` match).
    const sim = await prisma.$queryRaw<Array<{ s: number }>>`
      SELECT similarity(${'Пневмония у пожилого пациента'}, 'пневмония') AS s
    `;
    expect(Number(sim[0].s)).toBeGreaterThan(0);
  });
});
```

Keep the test hermetic: it creates exactly one case and the `afterAll` deletes it; it never creates a user (relies on the seeded admin).

- [ ] **Step 6: Run it — expect PASS** (the migration is already applied):

Run: `pnpm --filter @docjob/core exec -- dotenv -e ../../.env.local -e ../../.env -- vitest run src/search/fts.integration.test.ts`
Expected: PASS (indexes present, both FTS matches return the row).

If the "term only in body" assertion fails, the `jsonb_to_tsvector` path is wrong — verify `body` is stored as `jsonb` (Prisma `Json` → `jsonb`) and the `'["string"]'` filter is present.

- [ ] **Step 7: Full gate + commit.**

Run: `pnpm typecheck && pnpm test`
Expected: green.

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations packages/core/src/search/fts.integration.test.ts
git commit -m "feat(sp3): FTS migration — pg_trgm + generated searchDoc tsvector + bodyHash"
```

---

### Task 2: Core embed primitives — content hash + concurrency-guarded `reembedCase` + dirty lifecycle

**Files:**
- Modify: `packages/core/src/search/embeddings.ts`
- Modify: `packages/core/src/cases/case.service.ts` (`updateCase` sets `embeddingDirty: true`)
- Modify: `packages/core/src/index.ts` (re-export `reembedCase`, `markCaseDirty`, `hashEmbeddingText` alongside the existing embedding re-exports)
- Create: `packages/core/src/search/reembed.integration.test.ts`
- Modify: `packages/core/src/search/embeddings.test.ts` if one exists; else create `packages/core/src/search/embeddings.unit.test.ts`

**Interfaces:**
- Consumes: `buildCaseEmbeddingText`, `embedText`, `toVectorLiteral` (existing, `embeddings.ts`); `Case."bodyHash"`, `Case."embeddingDirty"`, `Case."embedding"` (T1 / existing schema).
- Produces:
  - `hashEmbeddingText(text: string): string` — sha256 hex of the embed input.
  - `reembedCase(caseId: string, opts?: { force?: boolean; embed?: (text: string) => Promise<number[]> }): Promise<'embedded' | 'skipped-unchanged' | 'skipped-stale' | 'skipped-nokey' | 'not-found' | 'failed'>` — guarded re-embed; `opts.embed` lets tests inject a fake embedder.
  - `markCaseDirty(caseId: string): Promise<void>` — sets `embeddingDirty = true` via raw SQL (no `updatedAt` bump).
  - `upsertCaseEmbedding(caseId: string): Promise<void>` — kept as a thin alias that calls `reembedCase(caseId)` and swallows the result (back-compat for the current cases router until T3 rewires it).

- [ ] **Step 1: Write the failing unit test** for the hash in `packages/core/src/search/embeddings.unit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hashEmbeddingText } from './embeddings';

describe('hashEmbeddingText', () => {
  it('is stable and deterministic for the same input', () => {
    const a = hashEmbeddingText('пневмония у пациента');
    const b = hashEmbeddingText('пневмония у пациента');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('differs when the text differs', () => {
    expect(hashEmbeddingText('a')).not.toBe(hashEmbeddingText('b'));
  });
});
```

- [ ] **Step 2: Run it → FAIL** (`hashEmbeddingText` not exported).

Run: `pnpm --filter @docjob/core exec -- vitest run src/search/embeddings.unit.test.ts`
Expected: FAIL "hashEmbeddingText is not a function".

- [ ] **Step 3: Implement the primitives in `embeddings.ts`.** Add the import at the top and the new functions; rewrite `upsertCaseEmbedding` as an alias.

```ts
import { createHash } from 'node:crypto';
```

```ts
/** sha256 hex of the embed-input text — the durability guard's content key. */
export function hashEmbeddingText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Flip the dirty flag without bumping updatedAt (raw SQL, so @updatedAt stays put). */
export async function markCaseDirty(caseId: string): Promise<void> {
  await prisma.$executeRaw`UPDATE "Case" SET "embeddingDirty" = true WHERE id = ${caseId}`;
}

export type ReembedResult =
  | 'embedded'
  | 'skipped-unchanged'
  | 'skipped-stale'
  | 'skipped-nokey'
  | 'not-found'
  | 'failed';

/**
 * Re-embed a case with durability + concurrency guards:
 *  - reads a snapshot (updatedAt + fields), builds text + hash;
 *  - if the hash matches the stored bodyHash and an embedding already exists
 *    and !force → just clears the dirty flag (no OpenAI call);
 *  - else embeds and writes embedding+bodyHash+embeddingDirty=false GUARDED by
 *    `WHERE "updatedAt" = <snapshot>` so a concurrent user edit (which bumps
 *    updatedAt via Prisma and re-sets dirty) is never clobbered — that row
 *    just stays dirty for the next sweep (returns 'skipped-stale').
 * Never throws: any error is logged and returned as 'failed' so the worker
 * loop and the write-path best-effort call are safe.
 */
export async function reembedCase(
  caseId: string,
  opts?: { force?: boolean; embed?: (text: string) => Promise<number[]> },
): Promise<ReembedResult> {
  try {
    if (!process.env.OPENAI_API_KEY && !opts?.embed) {
      return 'skipped-nokey';
    }
    const c = await prisma.case.findUnique({
      where: { id: caseId },
      select: {
        updatedAt: true, bodyHash: true,
        name: true, teaser: true, primaryCondition: true,
        specialty: true, subgroup: true, tags: true, body: true,
      },
    });
    if (!c) return 'not-found';

    const text = buildCaseEmbeddingText(c);
    const hash = hashEmbeddingText(text);

    // Already up to date (content unchanged, embedding present): clear the
    // flag cheaply, guarded so we don't unset a concurrent edit's dirty=true.
    if (!opts?.force && c.bodyHash === hash) {
      const cleared = await prisma.$executeRaw`
        UPDATE "Case" SET "embeddingDirty" = false
        WHERE id = ${caseId} AND "updatedAt" = ${c.updatedAt} AND "embedding" IS NOT NULL
      `;
      return cleared > 0 ? 'skipped-unchanged' : 'skipped-stale';
    }

    const embed = opts?.embed ?? embedText;
    const vector = await embed(text);
    const literal = toVectorLiteral(vector);
    const updated = await prisma.$executeRaw`
      UPDATE "Case"
      SET "embedding" = ${literal}::vector, "bodyHash" = ${hash}, "embeddingDirty" = false
      WHERE id = ${caseId} AND "updatedAt" = ${c.updatedAt}
    `;
    return updated > 0 ? 'embedded' : 'skipped-stale';
  } catch (error) {
    console.error('[embeddings] reembedCase failed for', caseId, error);
    return 'failed';
  }
}

/** Back-compat alias — pre-SP-3 callers (cases router) used this fire-and-forget name. */
export async function upsertCaseEmbedding(caseId: string): Promise<void> {
  await reembedCase(caseId);
}
```

Remove the old `upsertCaseEmbedding` body (the one that did an unguarded `UPDATE ... embedding = ...`), since the alias replaces it.

- [ ] **Step 4: Run the hash unit test → PASS.**

Run: `pnpm --filter @docjob/core exec -- vitest run src/search/embeddings.unit.test.ts`
Expected: PASS.

- [ ] **Step 5: `updateCase` marks the case dirty.** In `packages/core/src/cases/case.service.ts`, find the `prisma.case.update(...)` inside `updateCase` and add `embeddingDirty: true` to its `data`. (Create already gets `embeddingDirty` default `true` on the new row — no change there.) Locate the exact `data: { ... }` object and add the field; if the update is built from a spread, add `embeddingDirty: true` after the spread so it always wins.

- [ ] **Step 6: Write the failing integration test** `packages/core/src/search/reembed.integration.test.ts` (mock embedder — no OpenAI):

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '@docjob/db';
import { reembedCase } from './embeddings';

const fakeEmbed = async () => Array.from({ length: 1536 }, () => 0.001);

async function seedCase(name: string): Promise<string> {
  const author = await prisma.user.findFirst({ select: { id: true } });
  if (!author) throw new Error('seed an admin first (pnpm --filter @docjob/db db:seed)');
  const c = await prisma.case.create({
    data: { authorId: author.id, name, body: { blocks: [] } },
    select: { id: true },
  });
  return c.id;
}

describe('reembedCase (integration, real Postgres, mocked embedder)', () => {
  const ids: string[] = [];
  afterAll(async () => { if (ids.length) await prisma.case.deleteMany({ where: { id: { in: ids } } }); });

  it('embeds a dirty case and clears the flag + writes bodyHash', async () => {
    const id = await seedCase(`SP3 reembed ${Date.now()}`); ids.push(id);
    const r = await reembedCase(id, { embed: fakeEmbed });
    expect(r).toBe('embedded');
    const row = await prisma.case.findUniqueOrThrow({ where: { id }, select: { embeddingDirty: true, bodyHash: true } });
    expect(row.embeddingDirty).toBe(false);
    expect(row.bodyHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('skips re-embedding when content is unchanged (second run)', async () => {
    const id = await seedCase(`SP3 unchanged ${Date.now()}`); ids.push(id);
    expect(await reembedCase(id, { embed: fakeEmbed })).toBe('embedded');
    expect(await reembedCase(id, { embed: fakeEmbed })).toBe('skipped-unchanged');
  });

  it('returns not-found for a missing id', async () => {
    expect(await reembedCase('does-not-exist', { embed: fakeEmbed })).toBe('not-found');
  });
});
```

- [ ] **Step 7: Run it → PASS.**

Run: `pnpm --filter @docjob/core exec -- dotenv -e ../../.env.local -e ../../.env -- vitest run src/search/reembed.integration.test.ts`
Expected: PASS.

- [ ] **Step 8: Re-export from the core barrel.** In `packages/core/src/index.ts`, the existing `export * from './search/embeddings'` (or the explicit re-export list) already surfaces new exports — confirm `reembedCase`, `markCaseDirty`, `hashEmbeddingText` are reachable as `core.reembedCase` etc. (mirror how `upsertCaseEmbedding` is surfaced). Also confirm the `search.service.ts` re-export line at the bottom still compiles (it re-exports `upsertCaseEmbedding` by name — keep it, add `reembedCase`).

- [ ] **Step 9: Full gate + commit.**

Run: `pnpm typecheck && pnpm test`
Expected: green (all core + api + web tests; the existing search test still passes — `searchCases` unchanged in this task).

```bash
git add packages/core/src/search/embeddings.ts packages/core/src/search/embeddings.unit.test.ts packages/core/src/search/reembed.integration.test.ts packages/core/src/cases/case.service.ts packages/core/src/index.ts
git commit -m "feat(sp3): content-hashed, concurrency-guarded reembedCase + dirty lifecycle"
```

---

### Task 3: Re-index worker (sweep dirty cases) + runnable script + write-path wiring

**Files:**
- Create: `packages/core/src/search/reindex.service.ts`
- Modify: `packages/core/src/index.ts` (namespace re-export: `export * as reindex from './search/reindex.service'`)
- Create: `packages/core/src/search/reindex.integration.test.ts`
- Create: `apps/web/scripts/reembed-worker.ts`
- Modify: `apps/web/scripts/embed-cases.ts` (target dirty rows too)
- Modify: `apps/web/package.json` (add `reembed:cases` script)
- Modify: `packages/api/src/routers/cases.ts` (best-effort `reembedCase` after create/update)

**Interfaces:**
- Consumes: `reembedCase` (T2).
- Produces: `reembedDirtyCases(opts?: { limit?: number; concurrency?: number; embed?: (t: string) => Promise<number[]> }): Promise<{ processed: number; embedded: number; skipped: number; failed: number }>` — selects `WHERE "embeddingDirty" = true`, re-embeds each (bounded concurrency), tallies outcomes. Never throws.

- [ ] **Step 1: Write the failing integration test** `packages/core/src/search/reindex.integration.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '@docjob/db';
import { reembedDirtyCases } from './reindex.service';

const fakeEmbed = async () => Array.from({ length: 1536 }, () => 0.002);

describe('reembedDirtyCases (integration, real Postgres, mocked embedder)', () => {
  const ids: string[] = [];
  afterAll(async () => { if (ids.length) await prisma.case.deleteMany({ where: { id: { in: ids } } }); });

  it('sweeps dirty cases and clears them', async () => {
    const author = await prisma.user.findFirstOrThrow({ select: { id: true } });
    for (let i = 0; i < 3; i++) {
      const c = await prisma.case.create({
        data: { authorId: author.id, name: `SP3 sweep ${Date.now()}-${i}`, body: { blocks: [] } },
        select: { id: true },
      });
      ids.push(c.id);
    }
    // The 3 new rows are dirty by default; other pre-existing dirty rows may
    // also be swept — assert on OUR rows' final state, not global counts.
    const res = await reembedDirtyCases({ limit: 500, concurrency: 4, embed: fakeEmbed });
    expect(res.processed).toBeGreaterThanOrEqual(3);
    const mine = await prisma.case.findMany({ where: { id: { in: ids } }, select: { embeddingDirty: true } });
    expect(mine.every((r) => r.embeddingDirty === false)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it → FAIL** (module doesn't exist).

Run: `pnpm --filter @docjob/core exec -- dotenv -e ../../.env.local -e ../../.env -- vitest run src/search/reindex.integration.test.ts`
Expected: FAIL "Cannot find module './reindex.service'".

- [ ] **Step 3: Implement `reindex.service.ts`:**

```ts
import { prisma } from '@docjob/db';
import { reembedCase } from './embeddings';

/**
 * Background sweep of cases whose embedding is stale (`embeddingDirty = true`).
 * The durability backbone of embed-on-write (spec §6): the write path only
 * flips the dirty flag + best-effort inline embeds; this worker guarantees any
 * row a failed/absent inline embed left dirty is eventually re-embedded. Uses
 * `reembedCase`, which is itself concurrency-guarded (updatedAt snapshot), so
 * running this concurrently with live edits is safe. Never throws.
 */
export async function reembedDirtyCases(opts?: {
  limit?: number;
  concurrency?: number;
  embed?: (text: string) => Promise<number[]>;
}): Promise<{ processed: number; embedded: number; skipped: number; failed: number }> {
  const limit = opts?.limit ?? 100;
  const concurrency = Math.max(1, opts?.concurrency ?? 3);

  const dirty = await prisma.case.findMany({
    where: { embeddingDirty: true },
    select: { id: true },
    orderBy: { updatedAt: 'asc' },
    take: limit,
  });

  const tally = { processed: 0, embedded: 0, skipped: 0, failed: 0 };
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < dirty.length) {
      const item = dirty[cursor++];
      const r = await reembedCase(item.id, opts?.embed ? { embed: opts.embed } : undefined);
      tally.processed++;
      if (r === 'embedded') tally.embedded++;
      else if (r === 'failed') tally.failed++;
      else tally.skipped++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, dirty.length) }, worker));
  return tally;
}
```

- [ ] **Step 4: Run the test → PASS.**

Run: `pnpm --filter @docjob/core exec -- dotenv -e ../../.env.local -e ../../.env -- vitest run src/search/reindex.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Re-export the namespace.** In `packages/core/src/index.ts`, next to the other `export * as <domain>` lines, add:

```ts
export * as reindex from './search/reindex.service';
```

- [ ] **Step 6: Create the runnable worker script** `apps/web/scripts/reembed-worker.ts`:

```ts
import { config } from 'dotenv';
import { reindex } from '@docjob/core';

// Load env like the app (.env.local then .env).
config({ path: '.env.local' });
config({ path: '.env' });

async function runOnce(): Promise<void> {
  const res = await reindex.reembedDirtyCases({ limit: 200, concurrency: 3 });
  console.log(
    `[reembed] processed=${res.processed} embedded=${res.embedded} skipped=${res.skipped} failed=${res.failed}`,
  );
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('[reembed] OPENAI_API_KEY not set — dirty cases will be skipped.');
  }
  const loop = process.argv.includes('--loop');
  const intervalMs = Number(process.env.REEMBED_INTERVAL_MS ?? 60_000);
  if (!loop) {
    await runOnce();
    return;
  }
  // Simple long-running loop for a `worker` container / cron alternative.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await runOnce();
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => {
    if (!process.argv.includes('--loop')) {
      const { prisma } = await import('@docjob/db');
      await prisma.$disconnect();
    }
  });
```

- [ ] **Step 7: Update `embed-cases.ts`** to target dirty rows, not just `embedding IS NULL`. Replace the `missing` query:

```ts
  const missing = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Case" WHERE "embeddingDirty" = true OR embedding IS NULL
  `;
```

(The rest of the script already builds text, embeds, and writes — leave it; it stays a simple one-shot backfill. `reembed-worker.ts` is the durable/loopable variant that goes through the guarded `reembedCase`.)

- [ ] **Step 8: Add the npm script** to `apps/web/package.json` `"scripts"` (next to the existing `embed:cases`):

```json
    "reembed:cases": "dotenv -e ../../.env.local -e ../../.env -- tsx scripts/reembed-worker.ts",
```

(Match the exact runner the existing `embed:cases`/`import:cases` scripts use — if they invoke `tsx` via a different path, mirror it verbatim.)

- [ ] **Step 9: Rewire the cases router** (`packages/api/src/routers/cases.ts`) — swap the two `void core.search.upsertCaseEmbedding(data.id).catch(() => {})` lines for the guarded re-embed. Keep it best-effort (fire-and-forget) so the mutation latency is unchanged; the worker is the safety net:

```ts
  create: adminProcedure
    .input(z.custom<core.cases.CreateCaseInput>(isPlainObject))
    .mutation(async ({ ctx, input }) => {
      const data = await core.cases.createCase(ctx.actor, input);
      void core.reembedCase(data.id).catch(() => {});
      return data;
    }),

  update: adminProcedure
    .input(z.custom<core.cases.UpdateCaseInput>(isPlainObject))
    .mutation(async ({ ctx, input }) => {
      const data = await core.cases.updateCase(ctx.actor, input);
      void core.reembedCase(data.id).catch(() => {});
      return data;
    }),
```

Update the surrounding comment block (lines ~58-64) to say it now calls the guarded `reembedCase` (dirty-flag driven; the `reembedDirtyCases` worker is the durability backstop) instead of the old unguarded upsert.

- [ ] **Step 10: Full gate + commit.**

Run: `pnpm typecheck && pnpm test`
Expected: green.

```bash
git add packages/core/src/search/reindex.service.ts packages/core/src/search/reindex.integration.test.ts packages/core/src/index.ts packages/api/src/routers/cases.ts apps/web/scripts/reembed-worker.ts apps/web/scripts/embed-cases.ts apps/web/package.json
git commit -m "feat(sp3): dirty-sweep reindex worker + reembed:cases script + write-path rewiring"
```

---

### Task 4: Hybrid RRF search — lexical arm + fusion + `SearchHit` results

**Files:**
- Create: `packages/core/src/search/fusion.ts` (+ `fusion.test.ts`)
- Create: `packages/core/src/search/lexical.ts` (+ `lexical.integration.test.ts`)
- Modify: `packages/core/src/search/search.service.ts` (rewrite `searchCases` → `SearchHit[]`)
- Modify: `packages/core/src/search/search.service.test.ts` (assert new shape)
- Modify: `packages/core/src/index.ts` (surface `SearchHit`/`MatchSignal` types)
- Modify: `packages/api/src/routers/search.ts` (return type follows core; no logic change yet — rate-limit is T5)
- Modify: `apps/web/src/app/ai-search/**` (read `hit.case`; minimal parity)

**Interfaces:**
- Consumes: `embedText`/`toVectorLiteral` (existing); `Case."searchDoc"` (T1); `serializeCase`, `SerializedCase` (existing mapper).
- Produces:
  - `type MatchSignal = 'semantic' | 'lexical';`
  - `interface SearchHit { case: SerializedCase; score: number; matchedVia: MatchSignal[]; snippet: string | null; }`
  - `reciprocalRankFusion(lists: string[][], k?: number): Map<string, number>` (pure).
  - `lexicalSearch(query: string, limit: number): Promise<Array<{ id: string; snippet: string | null }>>` (raw SQL, ranked).
  - `searchCases(actor, query): Promise<SearchHit[]>` (rewritten).

- [ ] **Step 1: Write the failing pure-unit test for fusion** `packages/core/src/search/fusion.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { reciprocalRankFusion } from './fusion';

describe('reciprocalRankFusion', () => {
  it('rewards items ranked high across multiple lists', () => {
    const vector = ['a', 'b', 'c'];
    const lexical = ['b', 'a', 'd'];
    const fused = reciprocalRankFusion([vector, lexical], 60);
    // 'a' (ranks 1 & 2) and 'b' (ranks 2 & 1) beat 'c'/'d' (one list each).
    const order = [...fused.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => id);
    expect(order.slice(0, 2).sort()).toEqual(['a', 'b']);
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'));
  });

  it('handles empty and single lists', () => {
    expect(reciprocalRankFusion([]).size).toBe(0);
    expect(reciprocalRankFusion([['x']]).get('x')).toBeCloseTo(1 / 61);
  });
});
```

- [ ] **Step 2: Run → FAIL.** `pnpm --filter @docjob/core exec -- vitest run src/search/fusion.test.ts` → "Cannot find module './fusion'".

- [ ] **Step 3: Implement `fusion.ts`:**

```ts
import type { SerializedCase } from '../cases/case.mapper';

export type MatchSignal = 'semantic' | 'lexical';

export interface SearchHit {
  case: SerializedCase;
  score: number;
  matchedVia: MatchSignal[];
  snippet: string | null;
}

/**
 * Reciprocal Rank Fusion: score(d) = Σ 1/(k + rank_i(d)) across every ranked
 * list d appears in (rank is 0-based here, so +1). k dampens the weight of
 * lower ranks; 60 is the canonical default. Rank-based (not score-based) so
 * the vector arm's cosine distances and the lexical arm's ts_rank never need a
 * shared scale.
 */
export function reciprocalRankFusion(lists: string[][], k = 60): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, i) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i + 1));
    });
  }
  return scores;
}
```

- [ ] **Step 4: Run → PASS.** `pnpm --filter @docjob/core exec -- vitest run src/search/fusion.test.ts`.

- [ ] **Step 5: Write the failing lexical integration test** `packages/core/src/search/lexical.integration.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '@docjob/db';
import { lexicalSearch } from './lexical';

describe('lexicalSearch (integration, real Postgres)', () => {
  const ids: string[] = [];
  afterAll(async () => { if (ids.length) await prisma.case.deleteMany({ where: { id: { in: ids } } }); });

  it('finds a case by an FTS term and returns a snippet', async () => {
    const author = await prisma.user.findFirstOrThrow({ select: { id: true } });
    const c = await prisma.case.create({
      data: {
        authorId: author.id,
        name: `SP3 lexical бронхит ${Date.now()}`,
        teaser: 'острый бронхит с кашлем',
        body: { blocks: [] },
      },
      select: { id: true },
    });
    ids.push(c.id);
    const hits = await lexicalSearch('бронхит', 20);
    expect(hits.some((h) => h.id === c.id)).toBe(true);
  });

  it('returns [] for a blank query without throwing', async () => {
    expect(await lexicalSearch('   ', 20)).toEqual([]);
  });
});
```

- [ ] **Step 6: Implement `lexical.ts`:**

```ts
import { prisma } from '@docjob/db';

/**
 * Lexical arm of the hybrid search: Russian FTS over the generated `searchDoc`
 * (ranked by ts_rank) unioned with trigram similarity on `name` (typo/Kazakh
 * tolerance). Returns ids in rank order plus a highlighted snippet for the UX
 * "why matched" line. Raw SQL — the generated column + GIN indexes (SP-3 T1)
 * do the work. Guarded: a blank query short-circuits to [].
 */
export async function lexicalSearch(
  query: string,
  limit: number,
): Promise<Array<{ id: string; snippet: string | null }>> {
  const q = query.trim();
  if (!q) return [];
  // plainto_tsquery handles user text safely (no tsquery syntax injection).
  const rows = await prisma.$queryRaw<Array<{ id: string; snippet: string | null }>>`
    SELECT id,
      ts_headline('russian', coalesce(teaser, name),
        plainto_tsquery('russian', ${q}),
        'MaxFragments=1,MaxWords=18,MinWords=5,StartSel=<mark>,StopSel=</mark>') AS snippet
    FROM "Case"
    WHERE "searchDoc" @@ plainto_tsquery('russian', ${q})
       OR "name" % ${q}
    ORDER BY
      ts_rank("searchDoc", plainto_tsquery('russian', ${q})) DESC,
      similarity("name", ${q}) DESC
    LIMIT ${limit}
  `;
  return rows;
}
```

- [ ] **Step 7: Run → PASS.** `pnpm --filter @docjob/core exec -- dotenv -e ../../.env.local -e ../../.env -- vitest run src/search/lexical.integration.test.ts`.

- [ ] **Step 8: Rewrite `searchCases` in `search.service.ts`.** Replace the body of `searchCases` (keep `assertApproved`, the blank-query short-circuit, `extractSearchIntent`, `fallbackSearchCases`, and the intent boost logic — reuse them). New flow:

```ts
import { reciprocalRankFusion, type SearchHit, type MatchSignal } from './fusion';
import { lexicalSearch } from './lexical';
```

Replace the exported `searchCases` with:

```ts
const VECTOR_OVERFETCH = 50;
const LEXICAL_OVERFETCH = 50;
const RESULT_LIMIT = 12;

/** Over-fetched vector KNN (no WHERE filter, to protect HNSW recall). */
async function vectorSearchIds(refinedQuery: string): Promise<string[]> {
  const vector = await embedText(refinedQuery);
  const literal = toVectorLiteral(vector);
  const knn = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Case"
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${literal}::vector
    LIMIT ${VECTOR_OVERFETCH}
  `;
  return knn.map((r) => r.id);
}

/**
 * Hybrid search: runs a lexical arm (FTS+trigram on the RAW query — always,
 * even with no OpenAI key) and a semantic arm (embedding of the LLM-refined
 * query) in parallel, fuses them with RRF, applies intent-derived
 * tag/specialty/subgroup boosts, and returns ranked SearchHits. The LLM is
 * used ONLY for query understanding; returned cases are curated library
 * content (never generated). Degrades gracefully: OpenAI down → lexical-only;
 * lexical error too → substring fallback. Never throws to the caller.
 */
export async function searchCases(actor: Actor | null, query: string): Promise<SearchHit[]> {
  assertApproved(actor, 'Требуется авторизация.');
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Intent extraction is best-effort; raw query is the floor.
  let intent: SearchIntent = { refinedQuery: trimmed, tags: [], specialty: null, subgroup: null };
  const hasKey = Boolean(process.env.OPENAI_API_KEY);
  if (hasKey) {
    try {
      intent = await extractSearchIntent(trimmed);
    } catch (error) {
      console.error('searchCases intent extraction failed, using raw query', error);
    }
  }

  // Run both arms in parallel; each degrades to [] on its own failure.
  const [lexHits, vecIds] = await Promise.all([
    lexicalSearch(trimmed, LEXICAL_OVERFETCH).catch((e) => {
      console.error('lexical arm failed', e);
      return [] as Array<{ id: string; snippet: string | null }>;
    }),
    hasKey
      ? vectorSearchIds(intent.refinedQuery || trimmed).catch((e) => {
          console.error('vector arm failed', e);
          return [] as string[];
        })
      : Promise.resolve<string[]>([]),
  ]);

  const lexIds = lexHits.map((h) => h.id);
  const snippetById = new Map(lexHits.map((h) => [h.id, h.snippet]));

  // Both arms empty → last-ditch substring fallback (keeps the old contract).
  if (lexIds.length === 0 && vecIds.length === 0) {
    if (!trimmed) return [];
    console.warn('searchCases: both arms empty, substring fallback', { query: trimmed });
    const rows = await fallbackSearchCases(trimmed);
    if (rows.length === 0) console.warn('searchCases zero-result', { query: trimmed });
    return rows.map((c) => ({ case: c, score: 0, matchedVia: ['lexical'] as MatchSignal[], snippet: null }));
  }

  const fused = reciprocalRankFusion([vecIds, lexIds]);
  const lexSet = new Set(lexIds);
  const vecSet = new Set(vecIds);

  // Load every candidate row once.
  const candidateIds = [...fused.keys()];
  const rows = await prisma.case.findMany({ where: { id: { in: candidateIds } }, include: SEARCH_INCLUDE });
  const byId = new Map(rows.map((r) => [r.id, r]));

  // Intent boosts (additive on top of the RRF score).
  const wantTags = new Set(intent.tags.map(normSearch).filter(Boolean));
  const wantSpecialty = intent.specialty ? normSearch(intent.specialty) : null;
  const wantSubgroup = intent.subgroup ? normSearch(intent.subgroup) : null;

  const scored: SearchHit[] = candidateIds
    .map((id): SearchHit | null => {
      const row = byId.get(id);
      if (!row) return null;
      let score = fused.get(id) ?? 0;
      if (wantTags.size) {
        const rowTags = new Set((row.tags ?? []).map(normSearch));
        let overlap = 0;
        for (const t of wantTags) if (rowTags.has(t)) overlap += 1;
        score += overlap * 0.01;
      }
      if (wantSpecialty && row.specialty && normSearch(row.specialty) === wantSpecialty) score += 0.015;
      if (wantSubgroup && row.subgroup && normSearch(row.subgroup) === wantSubgroup) score += 0.008;
      const matchedVia: MatchSignal[] = [];
      if (vecSet.has(id)) matchedVia.push('semantic');
      if (lexSet.has(id)) matchedVia.push('lexical');
      return { case: serializeCase(row), score, matchedVia, snippet: snippetById.get(id) ?? null };
    })
    .filter((x): x is SearchHit => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, RESULT_LIMIT);

  if (scored.length === 0) console.warn('searchCases zero-result', { query: trimmed });
  return scored;
}
```

Keep `fallbackSearchCases`, `extractSearchIntent`, `normSearch`, `SEARCH_INCLUDE`, `searchIntentSchema`, `SearchIntent` as they are. Update the bottom re-export line to also export the new names:

```ts
export { embedText, buildCaseEmbeddingText, toVectorLiteral, upsertCaseEmbedding, reembedCase, EMBEDDING_MODEL, EMBEDDING_DIMS } from './embeddings';
export { reciprocalRankFusion } from './fusion';
export type { SearchHit, MatchSignal } from './fusion';
export { lexicalSearch } from './lexical';
```

- [ ] **Step 9: Update the existing search integration test** `search.service.test.ts` for the new return shape. Change the "returns a SerializedCase[]" assertions to read `hit.case`:

```ts
  it('searchCases returns SearchHit[] for a real query (hybrid or lexical-only)', async () => {
    const result = await searchService.searchCases(approvedActor, 'инфаркт');
    expect(Array.isArray(result)).toBe(true);
    for (const hit of result) {
      expect(typeof hit.case.id).toBe('string');
      expect(typeof hit.case.name).toBe('string');
      expect(hit.case).not.toHaveProperty('solution');
      expect(Array.isArray(hit.matchedVia)).toBe(true);
    }
  });
```

Keep the `UnauthorizedError` and blank-query (`[]`) tests unchanged (both still hold).

- [ ] **Step 10: Surface types from the barrel.** In `packages/core/src/index.ts`, the `export * as search from './search/search.service'` already carries `searchCases`; ensure `SearchHit`/`MatchSignal` are exported as types (they flow through the search.service re-export — confirm `core.search.SearchHit` type resolves, or add `export type { SearchHit, MatchSignal } from './search/fusion';` to the barrel).

- [ ] **Step 11: Update the tRPC search router** `packages/api/src/routers/search.ts` — the return type now flows through automatically (it just forwards `core.search.searchCases`). Update the doc comment to describe the hybrid RRF pipeline + the `SearchHit` shape. No logic change here (rate-limit is T5).

- [ ] **Step 12: Update the `ai-search` page for the new shape (minimal parity).** In `apps/web/src/app/ai-search/**`, the client currently maps `SerializedCase[]`. Find where results are rendered (a `.map((c) => ...)`), change it to `.map((hit) => ...)` and use `hit.case` wherever the case object was used. Do NOT add the badge/snippet UI yet (that is T6) — just keep the page compiling and rendering the same cards. If the page infers the result type from `trpc.search.search`/`utils.search.search.fetch`, TypeScript will force the `hit.case` change; fix each site.

- [ ] **Step 13: Gate + browser smoke.**

Run: `pnpm typecheck && pnpm test`
Expected: green. Then boot the dev server and smoke `/ai-search`:
- `pnpm --filter web exec -- dotenv -e ../../.env.local -e ../../.env -- next dev --turbopack` (use `preview_start` with a launch.json entry if configured), log in, run a query, confirm cards render (hybrid if key present, lexical-only otherwise). Check console/network for errors. Screenshot.

- [ ] **Step 14: Commit.**

```bash
git add packages/core/src/search/fusion.ts packages/core/src/search/fusion.test.ts packages/core/src/search/lexical.ts packages/core/src/search/lexical.integration.test.ts packages/core/src/search/search.service.ts packages/core/src/search/search.service.test.ts packages/core/src/index.ts packages/api/src/routers/search.ts apps/web/src/app/ai-search
git commit -m "feat(sp3): hybrid RRF search (vector + Russian FTS/trgm) returning SearchHit[]"
```

---

### Task 5: Query-embedding cache + search rate-limit

**Files:**
- Create: `packages/core/src/search/query-cache.ts` (+ `query-cache.test.ts`)
- Modify: `packages/core/src/search/search.service.ts` (use `embedQueryCached` in `vectorSearchIds`)
- Create: `packages/api/src/rate-limit.ts` (+ `rate-limit.test.ts`)
- Modify: `packages/api/src/routers/search.ts` (enforce the limiter)

**Interfaces:**
- Produces:
  - `interface QueryEmbeddingCache { get(key: string): number[] | undefined; set(key: string, vector: number[]): void; }`
  - `createInMemoryQueryCache(opts?: { ttlMs?: number; max?: number }): QueryEmbeddingCache`
  - `embedQueryCached(query: string, cache?: QueryEmbeddingCache): Promise<number[]>`
  - `createFixedWindowLimiter(opts?: { max?: number; windowMs?: number }): { take(key: string): { allowed: boolean; retryAfterSeconds: number } }`

- [ ] **Step 1: Failing cache unit test** `packages/core/src/search/query-cache.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createInMemoryQueryCache, embedQueryCached } from './query-cache';

describe('query embedding cache', () => {
  it('reuses a cached vector for the same normalized query', async () => {
    const cache = createInMemoryQueryCache();
    const embed = vi.fn(async () => [0.1, 0.2]);
    // embedQueryCached takes an injectable embedder for testability.
    const a = await embedQueryCached('  Инфаркт ', cache, embed);
    const b = await embedQueryCached('инфаркт', cache, embed); // normalized → same key
    expect(a).toEqual(b);
    expect(embed).toHaveBeenCalledTimes(1);
  });

  it('evicts after TTL', async () => {
    vi.useFakeTimers();
    const cache = createInMemoryQueryCache({ ttlMs: 1000 });
    const embed = vi.fn(async () => [0.3]);
    await embedQueryCached('x', cache, embed);
    vi.advanceTimersByTime(1500);
    await embedQueryCached('x', cache, embed);
    expect(embed).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run → FAIL.** `pnpm --filter @docjob/core exec -- vitest run src/search/query-cache.test.ts`.

- [ ] **Step 3: Implement `query-cache.ts`:**

```ts
import { embedText } from './embeddings';

export interface QueryEmbeddingCache {
  get(key: string): number[] | undefined;
  set(key: string, vector: number[]): void;
}

interface Entry { vector: number[]; expiresAt: number; }

/**
 * TTL + max-size in-memory query-embedding cache. Behind an interface so SP-5
 * can swap a Redis-backed implementation without touching search.service (same
 * dependency-injection pattern as auth's AttemptLimiter). Cheap FIFO eviction
 * when `max` is exceeded — the query space is small and repetitive.
 */
export function createInMemoryQueryCache(opts?: { ttlMs?: number; max?: number }): QueryEmbeddingCache {
  const ttlMs = opts?.ttlMs ?? 60 * 60 * 1000; // 1h
  const max = opts?.max ?? 500;
  const store = new Map<string, Entry>();
  return {
    get(key) {
      const e = store.get(key);
      if (!e) return undefined;
      if (e.expiresAt <= Date.now()) { store.delete(key); return undefined; }
      return e.vector;
    },
    set(key, vector) {
      if (store.size >= max) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
      store.set(key, { vector, expiresAt: Date.now() + ttlMs });
    },
  };
}

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Module-level default cache shared across searchCases calls in a process.
const defaultCache = createInMemoryQueryCache();

/**
 * Embed a query string, memoized by its normalized form. `embed` is injectable
 * for tests; production uses the real `embedText`.
 */
export async function embedQueryCached(
  query: string,
  cache: QueryEmbeddingCache = defaultCache,
  embed: (text: string) => Promise<number[]> = embedText,
): Promise<number[]> {
  const key = normalizeQuery(query);
  const hit = cache.get(key);
  if (hit) return hit;
  const vector = await embed(query);
  cache.set(key, vector);
  return vector;
}
```

- [ ] **Step 4: Run → PASS.** `pnpm --filter @docjob/core exec -- vitest run src/search/query-cache.test.ts`.

- [ ] **Step 5: Wire the cache into `search.service.ts`.** In `vectorSearchIds`, replace `const vector = await embedText(refinedQuery);` with `const vector = await embedQueryCached(refinedQuery);` and add the import: `import { embedQueryCached } from './query-cache';`.

- [ ] **Step 6: Failing rate-limit unit test** `packages/api/src/rate-limit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createFixedWindowLimiter } from './rate-limit';

describe('createFixedWindowLimiter', () => {
  it('allows up to max then blocks within the window', () => {
    const rl = createFixedWindowLimiter({ max: 3, windowMs: 60_000 });
    expect(rl.take('u1').allowed).toBe(true);
    expect(rl.take('u1').allowed).toBe(true);
    expect(rl.take('u1').allowed).toBe(true);
    const blocked = rl.take('u1');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('keys are independent', () => {
    const rl = createFixedWindowLimiter({ max: 1, windowMs: 60_000 });
    expect(rl.take('a').allowed).toBe(true);
    expect(rl.take('b').allowed).toBe(true);
    expect(rl.take('a').allowed).toBe(false);
  });
});
```

- [ ] **Step 7: Run → FAIL.** `pnpm --filter @docjob/api exec -- vitest run src/rate-limit.test.ts` (if `@docjob/api` has no vitest yet, add `vitest` devDep + a `test` script mirroring `@docjob/core`'s, and a `vitest.config.ts`; check first — SP-1d may already have set one up).

- [ ] **Step 8: Implement `rate-limit.ts`:**

```ts
/**
 * Minimal fixed-window rate limiter (in-memory). Used by the search router to
 * cap OpenAI-backed queries per user. Interface-light on purpose; SP-5 can
 * replace the Map with Redis. Not the same shape as auth's sliding-window
 * login limiter (that one has success-clears-window semantics that don't fit
 * "every call counts").
 */
interface Window { count: number; resetAt: number; }

export function createFixedWindowLimiter(opts?: { max?: number; windowMs?: number }) {
  const max = opts?.max ?? 30;
  const windowMs = opts?.windowMs ?? 60_000;
  const store = new Map<string, Window>();
  return {
    take(key: string): { allowed: boolean; retryAfterSeconds: number } {
      const now = Date.now();
      const w = store.get(key);
      if (!w || w.resetAt <= now) {
        store.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      if (w.count < max) {
        w.count += 1;
        return { allowed: true, retryAfterSeconds: 0 };
      }
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) };
    },
  };
}
```

- [ ] **Step 9: Run → PASS.**

- [ ] **Step 10: Enforce in the search router** `packages/api/src/routers/search.ts`:

```ts
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import * as core from '@docjob/core';
import { protectedProcedure, router } from '../trpc';
import { createFixedWindowLimiter } from '../rate-limit';

// Per-user search budget (in-memory; SP-5 → Redis). Module-level so it
// persists across requests in a process.
const searchLimiter = createFixedWindowLimiter({ max: 30, windowMs: 60_000 });

export const searchRouter = router({
  search: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(({ ctx, input }) => {
      const gate = searchLimiter.take(`search:${ctx.actor!.id}`);
      if (!gate.allowed) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Слишком много запросов. Повторите через ${gate.retryAfterSeconds} с.`,
        });
      }
      return core.search.searchCases(ctx.actor, input.query);
    }),
});
```

(Confirm `ctx.actor` is non-null in `protectedProcedure` — the tier guarantees it; use the existing non-null convention the other protected routers use. If they use `ctx.actor.id` without `!`, match that.)

- [ ] **Step 11: Gate + commit.**

Run: `pnpm typecheck && pnpm test`
Expected: green.

```bash
git add packages/core/src/search/query-cache.ts packages/core/src/search/query-cache.test.ts packages/core/src/search/search.service.ts packages/api/src/rate-limit.ts packages/api/src/rate-limit.test.ts packages/api/src/routers/search.ts
git commit -m "feat(sp3): query-embedding cache + per-user search rate-limit"
```

---

### Task 6: Search UX (why-matched + snippet + zero-result) + embedding backfill + final gate

**Files:**
- Modify: `apps/web/src/app/ai-search/**` (result card: matched-via badge, snippet, zero-result empty state)
- (No new server code — consumes `SearchHit` fields from T4.)

**Interfaces:**
- Consumes: `SearchHit { case, score, matchedVia, snippet }` from `trpc.search.search`.

- [ ] **Step 1: Render the "why matched" badge + snippet on each result card.** In the `ai-search` results map (now `hit`), under the case title/teaser add:
  - a small badge row from `hit.matchedVia`: `semantic` → «Смысл» (icon `Sparkles`), `lexical` → «Совпадение» (icon `Search`), using the shadcn `Badge` (`variant="secondary"`) + `cn()`. Both may show.
  - if `hit.snippet` is present, render it below the teaser. The snippet contains `<mark>…</mark>` from `ts_headline` — render via `dangerouslySetInnerHTML` **only after** stripping everything except `<mark>`/`</mark>` (the snippet is server-generated from curated case text, but sanitize defensively):

```tsx
function renderSnippet(html: string): string {
  // Allow only <mark>/</mark>; escape all other angle brackets.
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&lt;mark&gt;/g, '<mark>')
    .replace(/&lt;\/mark&gt;/g, '</mark>');
}
```

Use it: `<p className="text-sm text-muted-foreground mt-1" dangerouslySetInnerHTML={{ __html: renderSnippet(hit.snippet) }} />`. Style `<mark>` in `globals.css` for dark mode (e.g. `mark { background: hsl(var(--primary)/0.25); color: inherit; border-radius: 2px; }`) if not already themed.

- [ ] **Step 2: Zero-result empty state.** When the query is non-empty and results are `[]`, show a friendly empty state (icon `SearchX`, «Ничего не найдено по запросу “…”. Попробуйте переформулировать.»). Keep the existing loading state. Ensure the initial (no query yet) state is distinct from zero-results.

- [ ] **Step 3: Backfill embeddings** so the semantic arm has data (only meaningful if `OPENAI_API_KEY` is set locally):

Run: `pnpm --filter web reembed:cases`
Expected: `[reembed] processed=… embedded=…`. If no key, it logs the skip warning — that's fine; lexical arm still works. Note the result in the task report.

- [ ] **Step 4: FINAL GATE.**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: all green (typecheck all packages, full test suite, `next build`).

Browser smoke `/ai-search` (log in as the seeded doctor or admin):
- Run a query that should match a seeded case → cards render with a matched-via badge; snippet highlights the term.
- Run a nonsense query → zero-result empty state.
- If a key is configured, confirm both `semantic` + `lexical` badges can appear; without a key, `lexical` still returns results (degradation works).
- Check console + network: no errors; the `search` call returns `SearchHit[]`.
- Screenshot the results + the empty state. Stop the dev server afterward.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/app/ai-search apps/web/src/app/globals.css
git commit -m "feat(sp3): search UX — matched-via badges, highlighted snippets, zero-result state"
```

---

## Self-Review

**Spec §6 coverage:**
- Embed-on-write durability (dirty flag + worker + version/bodyHash guard) → T1 (`bodyHash`), T2 (`reembedCase` guard + `updateCase` dirty), T3 (`reembedDirtyCases` sweep + script + write-path rewire). ✅
- Fixes the "old `embed:cases` only handled `embedding IS NULL`" gap → T3 Step 7. ✅
- Hybrid (net-new): Russian FTS + GIN + `pg_trgm` → T1; RRF (vector ⊕ lexical) → T4. ✅
- HNSW-`WHERE` recall trap → T4 over-fetch (50) + post-filter, vector arm runs with no filter. ✅
- Cost: query-embedding cache (TTL) + rate-limit + submit-trigger (search is already submit/debounce-triggered on the page) → T5. ✅
- "No generation" reconciliation → explicit decision (keep intent-extraction, reframe claim, lexical arm independent of it) — documented up top + in T4 code comment + T6 copy. ✅
- UX: term highlighting (`ts_headline` `<mark>`), "why found" (matched-via badges), empty/zero-result state, zero-result logging (`console.warn('searchCases zero-result')`) → T4 (log) + T6 (UI). ✅

**Placeholder scan:** every step has concrete SQL / TS / commands. The only intentionally-open items are "match the exact `tsx` runner path the sibling scripts use" (T3 S8) and "match the existing `ctx.actor` non-null convention" (T5 S10) — both are "conform to the adjacent code" instructions with the fallback spelled out, not missing content.

**Type consistency:** `reembedCase` returns the `ReembedResult` union used by `reembedDirtyCases`'s tally (T2↔T3). `SearchHit { case, score, matchedVia, snippet }` is defined in `fusion.ts` (T4) and consumed identically by the router (T4/T5), the search test (T4 S9), and the web page (T4 S12 / T6). `reciprocalRankFusion(lists, k)` signature matches its test (T4 S1) and caller (T4 S8). `embedQueryCached(query, cache?, embed?)` matches its test (T5 S1) and the `vectorSearchIds` caller (T5 S5, which passes only `query`). `createFixedWindowLimiter({max,windowMs}).take(key)` matches its test (T5 S6) and router (T5 S10).

## Risks
- **Generated-column immutability:** if Postgres rejects the `GENERATED ALWAYS AS (...)` (some `jsonb_to_tsvector`/`array_to_string` overload isn't seen as immutable on the installed PG version), fall back to a trigger-maintained `tsvector` column (BEFORE INSERT/UPDATE) — same column name + indexes, so nothing downstream changes. T1 Step 6 will catch it (the body-term match would fail or the ALTER would error).
- **`updatedAt` guard precision:** the concurrency guard compares the `timestamptz` snapshot exactly. Because `reembedCase` writes via `$executeRaw` (which does NOT trigger Prisma's `@updatedAt`), our own clear won't self-invalidate; only a real Prisma `updateCase` bumps it. Verified by the T2 unchanged-skip test. If a subtle precision mismatch appears, switch the guard to `WHERE "bodyHash" IS DISTINCT FROM ${hash} OR "embeddingDirty" = true` semantics — but the snapshot approach is preferred (it also guards the embedding write, not just the flag).
- **Kazakh (KK) content:** the FTS config is `russian`; KK terms won't stem but are still covered by the `pg_trgm` `name % q` arm and (untokenized) exact matches. Good enough for SP-3; a dedicated `simple`+`unaccent` KK config is a future refinement (note it, don't build it).
- **Result-shape change** (`SerializedCase[]` → `SearchHit[]`) is the one breaking API change; it's contained to the `ai-search` page (T4 S12) — TypeScript flags every call site. No other consumer calls `search.search`.
- **`@docjob/api` test harness:** if SP-1d didn't add vitest to `@docjob/api`, T5 adds it; keep it identical to `@docjob/core`'s config so `pnpm test` picks it up via turbo.
