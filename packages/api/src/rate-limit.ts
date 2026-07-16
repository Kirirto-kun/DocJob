/**
 * Minimal fixed-window rate limiter (in-memory). Used by the search router to
 * cap OpenAI-backed queries per user, and by the users router to throttle
 * password-reset requests. Interface-light on purpose so a Redis-backed
 * implementation (`rate-limit-redis.ts`) can swap in without touching call
 * sites beyond `await`ing `.take()`. Not the same shape as auth's
 * sliding-window login limiter (that one has success-clears-window semantics
 * that don't fit "every call counts").
 *
 * SP-5 T4 note: `.take()` is `Promise`-returning even though the in-memory
 * implementation below never actually awaits anything internally — a
 * Redis-backed limiter cannot answer without a network round trip, and
 * there's no synchronous Redis client in Node, so the interface has to be
 * async for any backend to satisfy it.
 */
export interface FixedWindowLimiter {
  take(key: string): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}

interface Window {
  count: number;
  resetAt: number;
}

/**
 * `store.size` threshold above which `take()` opportunistically sweeps out
 * expired windows before doing its own work. Chosen high enough that a
 * healthy, bounded set of active keys (e.g. per-actor search throttling)
 * never triggers a sweep in normal operation, but low enough that an
 * unauthenticated, unbounded-key-space caller (e.g. the reset-password
 * limiter, keyed by attacker-supplied email) gets pruned back down instead
 * of growing forever.
 */
const PRUNE_THRESHOLD = 10_000;

/**
 * Deletes every entry whose window has already fully elapsed. Only called
 * once `store.size` crosses `PRUNE_THRESHOLD`, so the common case (few
 * distinct keys) pays nothing extra per `take()` call.
 */
function pruneExpired(store: Map<string, Window>, now: number): void {
  for (const [key, w] of store) {
    if (w.resetAt <= now) store.delete(key);
  }
}

function buildLimiter(store: Map<string, Window>, max: number, windowMs: number): FixedWindowLimiter {
  return {
    async take(key: string) {
      const now = Date.now();
      // SP-5 T4 robustness fix: `store` previously only ever grew — an
      // expired window was overwritten lazily on its NEXT access to that
      // same key, never evicted outright. An unauthenticated caller with an
      // attacker-controlled key space (e.g. `resetLimiter`'s `email:<addr>`
      // keys — see `packages/api/src/routers/users.ts`) could grow this Map
      // unboundedly by POSTing a stream of distinct emails, since a key that
      // is never revisited is never cleaned up. Sweeping expired entries
      // once the store gets large bounds memory by ACTIVE windows instead of
      // all-time unique keys, without changing behavior for any live key.
      if (store.size > PRUNE_THRESHOLD) {
        pruneExpired(store, now);
      }
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

export function createFixedWindowLimiter(opts?: { max?: number; windowMs?: number }): FixedWindowLimiter {
  const max = opts?.max ?? 30;
  const windowMs = opts?.windowMs ?? 60_000;
  const store = new Map<string, Window>();
  return buildLimiter(store, max, windowMs);
}

/**
 * Test-only variant of `createFixedWindowLimiter` that also exposes the
 * live `Map`'s size, so tests can assert the `PRUNE_THRESHOLD` eviction
 * behavior above without reaching into module internals. Mirrors the
 * `__resetRedisForTests` test-escape-hatch naming convention used elsewhere
 * in the monorepo (`packages/config/src/redis.ts`). Never called from
 * production code.
 */
export function __createFixedWindowLimiterForTests(
  opts?: { max?: number; windowMs?: number },
): FixedWindowLimiter & { storeSize(): number } {
  const max = opts?.max ?? 30;
  const windowMs = opts?.windowMs ?? 60_000;
  const store = new Map<string, Window>();
  const limiter = buildLimiter(store, max, windowMs);
  return { ...limiter, storeSize: () => store.size };
}
