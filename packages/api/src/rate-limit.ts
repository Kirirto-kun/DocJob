/**
 * Minimal fixed-window rate limiter (in-memory). Used by the search router to
 * cap OpenAI-backed queries per user. Interface-light on purpose; SP-5 can
 * replace the Map with Redis. Not the same shape as auth's sliding-window
 * login limiter (that one has success-clears-window semantics that don't fit
 * "every call counts").
 */
interface Window { count: number; resetAt: number; }

export function createFixedWindowLimiter(opts?: { max?: number; windowMs?: number }) {
  const max = opts?.max ?? 30;
  const windowMs = opts?.windowMs ?? 60_000;
  const store = new Map<string, Window>();
  return {
    take(key: string): { allowed: boolean; retryAfterSeconds: number } {
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
