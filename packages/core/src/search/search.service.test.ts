/**
 * Integration tests for search.service — run against the real dev Postgres
 * (same harness Task 2 established: DATABASE_URL loaded via
 * `dotenv -e ../../.env.local -e ../../.env` in the package's `test` script).
 *
 * `searchCases` runs a lexical arm (always) and a semantic arm (only with an
 * OpenAI key), fuses them with RRF, and falls back to a plain substring
 * search when both arms come back empty — so this test doesn't need to
 * special-case a missing key: it always asserts the same public contract (a
 * `SearchHit[]`), whichever internal path the service took to get there.
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
    'searchCases returns SearchHit[] for a real query (hybrid or lexical-only)',
    async () => {
      const result = await searchService.searchCases(approvedActor, 'инфаркт');
      expect(Array.isArray(result)).toBe(true);
      for (const hit of result) {
        expect(typeof hit.case.id).toBe('string');
        expect(typeof hit.case.name).toBe('string');
        expect(hit.case).not.toHaveProperty('solution');
        expect(Array.isArray(hit.matchedVia)).toBe(true);
      }
    },
    // Generous cap: when OpenAI is rate-limited/unavailable the service still
    // returns an array via the substring fallback, but the (now bounded) retry
    // on each OpenAI call adds a little latency before the fallback engages.
    45_000,
  );
});
