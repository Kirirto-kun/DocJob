import { z } from 'zod';
import * as core from '@docjob/core';
import { protectedProcedure, router } from '../trpc';

/**
 * `search` tRPC router — thin wire wrapper over `@docjob/core`'s
 * `search.searchCases` (packages/core/src/search/search.service.ts). Hybrid
 * RAG search (OpenAI intent extraction + pgvector KNN) with a substring
 * fallback when no API key / no embedded cases / OpenAI errors (e.g. 429) —
 * all of that lives in core; this router only forwards the query string and
 * returns whatever core returns (always an array, even on fallback).
 */
export const searchRouter = router({
  search: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(({ ctx, input }) => core.search.searchCases(ctx.actor, input.query)),
});
