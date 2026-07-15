import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import * as core from '@docjob/core';
import { protectedProcedure, router } from '../trpc';
import { createFixedWindowLimiter } from '../rate-limit';

/**
 * `search` tRPC router — thin wire wrapper over `@docjob/core`'s
 * `search.searchCases` (packages/core/src/search/search.service.ts). SP-3 T4
 * hybrid search: a lexical arm (Russian FTS + trigram, always runs on the raw
 * query) and a semantic arm (pgvector KNN over an LLM-refined query, only
 * when `OPENAI_API_KEY` is set) are fused via Reciprocal Rank Fusion, boosted
 * by intent-derived tag/specialty/subgroup overlap, and — if both arms come
 * back empty — backstopped by a plain substring fallback. All of that lives
 * in core; this router only forwards the query string and returns whatever
 * core returns: an array of `SearchHit` (`{ case, score, matchedVia, snippet }`).
 *
 * SP-3 T5: gated by a per-user fixed-window rate limit (`../rate-limit.ts`)
 * before it ever reaches core, since each call can trigger an OpenAI intent
 * + embedding round-trip. In-memory / module-level so it persists across
 * requests in a process; SP-5 can swap it for a Redis-backed limiter without
 * touching this router's shape.
 */
const searchLimiter = createFixedWindowLimiter({ max: 30, windowMs: 60_000 });

export const searchRouter = router({
  search: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(({ ctx, input }) => {
      const gate = searchLimiter.take(`search:${ctx.actor.id}`);
      if (!gate.allowed) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Слишком много запросов. Повторите через ${gate.retryAfterSeconds} с.`,
        });
      }
      return core.search.searchCases(ctx.actor, input.query);
    }),
});
