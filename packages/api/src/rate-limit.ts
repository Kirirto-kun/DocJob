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

export function createFixedWindowLimiter(opts?: { max?: number; windowMs?: number }): FixedWindowLimiter {
  const max = opts?.max ?? 30;
  const windowMs = opts?.windowMs ?? 60_000;
  const store = new Map<string, Window>();
  return {
    async take(key: string) {
      const now = Date.now();
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
