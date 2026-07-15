import { z } from 'zod';
import * as core from '@docjob/core';
import { protectedProcedure, router } from '../trpc';

/**
 * `search` tRPC router — thin wire wrapper over `@docjob/core`'s
 * `search.searchCases` (packages/core/src/search/search.service.ts). SP-3 T4
 * hybrid search: a lexical arm (Russian FTS + trigram, always runs on the raw
 * query) and a semantic arm (pgvector KNN over an LLM-refined query, only
 * when `OPENAI_API_KEY` is set) are fused via Reciprocal Rank Fusion, boosted
 * by intent-derived tag/specialty/subgroup overlap, and — if both arms come
 * back empty — backstopped by a plain substring fallback. All of that lives
 * in core; this router only forwards the query string and returns whatever
 * core returns: an array of `SearchHit` (`{ case, score, matchedVia, snippet }`),
 * always an array, never throws (rate-limiting is SP-3 T5).
 */
export const searchRouter = router({
  search: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(({ ctx, input }) => core.search.searchCases(ctx.actor, input.query)),
});
