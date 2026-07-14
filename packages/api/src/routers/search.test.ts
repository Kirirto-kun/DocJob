/**
 * Integration tests for the `search` tRPC router — run against the real dev
 * Postgres (same harness cases.test.ts/context.test.ts use). `search.search`
 * forwards straight into `@docjob/core`'s `search.searchCases`, which itself
 * falls back to a plain substring search whenever OpenAI is unavailable
 * (missing key, quota, network) — so this test doesn't special-case a
 * missing key/quota, it always asserts the same public contract (an array),
 * whichever internal path core took to get there. See
 * packages/core/src/search/search.service.test.ts for the equivalent
 * core-level coverage.
 */
import { describe, it, expect } from 'vitest';
import { TRPCError } from '@trpc/server';
import type { Actor } from '@docjob/core';
import { appRouter } from '../root';
import { createCallerFactory } from '../trpc';

const createCaller = createCallerFactory(appRouter);

async function captureTRPCError(fn: () => Promise<unknown>): Promise<TRPCError> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof TRPCError) return e;
    throw e;
  }
  throw new Error('expected a TRPCError to be thrown');
}

describe('search router (integration, real Postgres)', () => {
  // No FK dependency on this actor's id (searchCases never persists
  // anything keyed by actor), so a throwaway id is fine here, same as
  // search.service.test.ts's own `approvedActor`.
  const approvedActor: Actor = { id: 'not-a-real-user', role: 'DOCTOR', approvedAt: new Date() };

  it('search throws UNAUTHORIZED for no actor (protectedProcedure gate)', async () => {
    const caller = createCaller({ actor: null });
    const err = await captureTRPCError(() => caller.search.search({ query: 'инфаркт' }));
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it(
    'search returns an array for a real query (live OpenAI call if a key is configured, ' +
      'substring fallback otherwise -- either way the query executes without throwing)',
    async () => {
      const caller = createCaller({ actor: approvedActor });
      const result = await caller.search.search({ query: 'инфаркт' });
      expect(Array.isArray(result)).toBe(true);
      for (const c of result) {
        expect(typeof c.id).toBe('string');
        expect(typeof c.name).toBe('string');
        expect(c).not.toHaveProperty('solution');
      }
    },
    // Generous cap: when OpenAI is rate-limited/unavailable the service
    // still returns an array via the substring fallback, but the bounded
    // retry on each OpenAI call adds a little latency before that engages.
    45_000,
  );

  it('search returns an empty array for a blank query without calling OpenAI', async () => {
    const caller = createCaller({ actor: approvedActor });
    const result = await caller.search.search({ query: '   ' });
    expect(result).toEqual([]);
  });
});
