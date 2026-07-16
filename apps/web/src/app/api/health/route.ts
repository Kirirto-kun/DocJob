import { NextResponse } from 'next/server';
import { prisma } from '@docjob/db';
import { logger } from '@/lib/logger';

/**
 * Liveness/readiness probe (SP-5 T3) — polled by Docker's `web` healthcheck
 * (`docker-compose.yml`), a future Nginx `upstream` check, and any external
 * uptime monitor. Deliberately:
 *  - **No auth** — must be reachable pre-login (see `src/middleware.ts`'s
 *    `isPublic()`, which allowlists this exact path).
 *  - **Cheap** — a single `SELECT 1`, not a real query against app tables.
 *  - **Bounded** — races the DB check against a short timeout so a wedged
 *    connection pool fails fast instead of hanging the health check itself.
 *  - **Never cached** — `Cache-Control: no-store` so an intermediary proxy
 *    can't serve a stale "ok" after the DB has gone down.
 *
 * Needs the Node runtime (not Edge) because `@docjob/db`'s Prisma client
 * isn't Edge-safe — same reasoning as `/api/auth/*` and `/api/trpc/*`.
 */
export const runtime = 'nodejs';

const DB_CHECK_TIMEOUT_MS = 2500;

type DbCheckResult = { up: true } | { up: false; error: unknown };

async function checkDb(): Promise<DbCheckResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('db healthcheck timed out')), DB_CHECK_TIMEOUT_MS);
      }),
    ]);
    return { up: true };
  } catch (error) {
    return { up: false, error };
  } finally {
    // Clear the race's loser: on the success path the timeout promise never
    // settles, so without this its timer would keep the event loop busy for
    // up to DB_CHECK_TIMEOUT_MS after every successful check.
    clearTimeout(timer);
  }
}

// Module-scoped so we only log on a status *change*, not on every poll (the
// container healthcheck alone polls every 30s — logging each one would just
// be noise). Resets on process restart, which is fine: a fresh process
// logging its first observed status is itself useful signal.
let lastStatus: 'ok' | 'degraded' | null = null;

export async function GET(): Promise<NextResponse> {
  const result = await checkDb();
  const status: 'ok' | 'degraded' = result.up ? 'ok' : 'degraded';
  const ts = new Date().toISOString();

  if (status !== lastStatus) {
    const fields: Record<string, unknown> = { from: lastStatus, to: status };
    if (!result.up) fields.err = result.error;
    logger[status === 'ok' ? 'info' : 'warn']('health status transition', fields);
    lastStatus = status;
  }

  const body = result.up ? { status: 'ok' as const, db: 'up' as const, ts } : { status: 'degraded' as const, db: 'down' as const, ts };

  return NextResponse.json(body, {
    status: result.up ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
