/**
 * Integration tests for search.service — run against the real dev Postgres
 * (same harness Task 2 established: DATABASE_URL loaded via
 * `dotenv -e ../../.env.local -e ../../.env` in the package's `test` script).
 *
 * `searchCases` internally falls back to a plain substring search whenever
 * OpenAI is unavailable (missing key, quota, network) or there are no
 * embedded cases yet — so this test doesn't need to special-case a missing
 * key: it always asserts the same public contract (a `SerializedCase[]`),
 * whichever internal path the service took to get there.
 */
import { describe, it, expect } from 'vitest';
import { UnauthorizedError } from '../shared/errors';
import type { Actor } from '../shared/actor';
import * as searchService from './search.service';

describe('search.service (integration, real Postgres)', () => {
  const approvedActor: Actor = { id: 'not-a-real-user', role: 'DOCTOR', approvedAt: new Date() };

  it('searchCases throws UnauthorizedError for no actor', async () => {
    await expect(searchService.searchCases(null, 'инфаркт')).rejects.toThrow(UnauthorizedError);
  });

  it('searchCases returns an empty array for a blank query without calling OpenAI', async () => {
    const result = await searchService.searchCases(approvedActor, '   ');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
  });

  it(
    'searchCases returns a SerializedCase[] for a real query (live OpenAI call if a ' +
      'key is configured, substring fallback otherwise — either way the query builds ' +
      'and executes against Postgres without throwing)',
    async () => {
      const result = await searchService.searchCases(approvedActor, 'инфаркт');
      expect(Array.isArray(result)).toBe(true);
      for (const c of result) {
        expect(typeof c.id).toBe('string');
        expect(typeof c.name).toBe('string');
        expect(c).not.toHaveProperty('solution');
      }
    },
    // Generous cap: when OpenAI is rate-limited/unavailable the service still
    // returns an array via the substring fallback, but the (now bounded) retry
    // on each OpenAI call adds a little latency before the fallback engages.
    45_000,
  );
});
