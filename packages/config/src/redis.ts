import Redis from 'ioredis';

/**
 * Lazily-constructed, memoized `ioredis` client shared by every Redis-backed
 * adapter in the monorepo (auth's `AttemptLimiter`, api's fixed-window
 * limiter, core's `QueryEmbeddingCache`) — SP-5 T4. Reads `REDIS_URL` once
 * per process; returns `null` when it's unset, which is the default,
 * backward-compatible single-VPS deployment (every adapter's selector falls
 * back to its existing in-memory implementation in that case — see each
 * package's `rate-limit-redis.ts` / `query-cache-redis.ts`).
 *
 * Memoized module-level (not per-caller): the first call that observes
 * `REDIS_URL` set constructs one client, and every later call — from any
 * package, any adapter — reuses it, so a single web/worker process opens
 * exactly one Redis connection no matter how many adapters ask for it.
 *
 * `undefined` (not yet computed) is distinguished from `null` (computed,
 * no `REDIS_URL`) so this only ever constructs a client at most once.
 */
let cached: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (cached !== undefined) return cached;

  const url = process.env.REDIS_URL;
  if (!url) {
    cached = null;
    return cached;
  }

  const client = new Redis(url, {
    // Connect on the first actual command rather than at construction time
    // — a process path that calls getRedis() speculatively (e.g. a
    // selector deciding which implementation to use) shouldn't pay a
    // connection attempt if it then goes on to never issue a command.
    lazyConnect: true,
    // Fail a given command quickly instead of ioredis buffering/retrying it
    // indefinitely while the server is unreachable — every adapter built on
    // top of this client treats a rejected call as "Redis unavailable right
    // now" and degrades (see each adapter's try/catch), not as "hang the
    // request".
    maxRetriesPerRequest: 2,
    retryStrategy(times) {
      return Math.min(times * 200, 2000);
    },
  });

  // ioredis emits an 'error' event for every failed connection/command
  // attempt; an EventEmitter with no 'error' listener crashes the Node
  // process on the first one. This listener is what makes "missing/
  // unreachable Redis doesn't crash the process" true — the adapters'
  // own try/catch around individual commands handles graceful degradation
  // per-call, this only prevents the unhandled-error crash.
  client.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[redis] connection error:', err instanceof Error ? err.message : err);
  });

  cached = client;
  return cached;
}

/**
 * Test-only escape hatch: resets the memoized client so a test can control
 * `REDIS_URL` / mock `getRedis()` without leaking state into the next test
 * file. Never called from production code.
 */
export function __resetRedisForTests(): void {
  cached = undefined;
}
