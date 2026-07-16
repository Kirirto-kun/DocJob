/**
 * Unit test for `GET /api/health` (SP-5 T3). `@docjob/db`'s `prisma` is
 * mocked at the module level (`vi.mock` is hoisted above imports by vitest),
 * so this never touches a real Postgres — unlike the auth/session route
 * tests in this repo, which deliberately run against the real dev Postgres.
 * A liveness probe's own test should be fast and DB-independent; the real
 * DB-down behavior is exercised manually (`docker compose stop postgres` +
 * `curl`), not simulated here beyond a rejected `$queryRaw`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryRawMock = vi.fn();

vi.mock('@docjob/db', () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRawMock(...args),
  },
}));

import { GET } from './route';

describe('GET /api/health', () => {
  beforeEach(() => {
    queryRawMock.mockReset();
  });

  it('returns 200 { status: "ok", db: "up" } when the DB liveness check succeeds', async () => {
    queryRawMock.mockResolvedValue([{ '?column?': 1 }]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as { status: string; db: string; ts: string };
    expect(body.status).toBe('ok');
    expect(body.db).toBe('up');
    expect(typeof body.ts).toBe('string');
    expect(Number.isNaN(Date.parse(body.ts))).toBe(false);
  });

  it('returns 503 { status: "degraded", db: "down" } when the DB liveness check rejects', async () => {
    queryRawMock.mockRejectedValue(new Error('connection refused'));

    const res = await GET();

    expect(res.status).toBe(503);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as { status: string; db: string };
    expect(body.status).toBe('degraded');
    expect(body.db).toBe('down');
  });

  it('recovers to 200 once the DB check succeeds again after a prior failure', async () => {
    queryRawMock.mockRejectedValueOnce(new Error('connection refused'));
    const first = await GET();
    expect(first.status).toBe(503);

    queryRawMock.mockResolvedValueOnce([{ '?column?': 1 }]);
    const second = await GET();
    expect(second.status).toBe(200);
    const body = (await second.json()) as { status: string };
    expect(body.status).toBe('ok');
  });
});
