import { getRedis } from '@docjob/config';
import { createFixedWindowLimiter, type FixedWindowLimiter } from './rate-limit';

/**
 * Structural subset of `ioredis`'s client this adapter calls — a real
 * `Redis` instance (from `getRedis()`) satisfies this by shape, and unit
 * tests can pass a small hand-rolled fake instead of a live connection.
 */
export interface RedisLike {
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<number>;
  pttl(key: string): Promise<number>;
}

/**
 * Redis-backed fixed-window limiter — `INCR` + `PEXPIRE` (set only on the
 * FIRST increment of a window, matching `createFixedWindowLimiter`'s
 * "window resets when it naturally expires" semantics), same `.take(key)`
 * shape as the in-memory version. `INCR` is atomic, so exactly one caller
 * ever observes `count === 1` for a given window even under concurrent
 * requests from multiple web instances — no separate lock needed.
 *
 * Namespaced per-caller (`opts.namespace`) so two independently-configured
 * limiters sharing one Redis instance (e.g. `search` vs `reset-pw`, see
 * `getFixedWindowLimiter` below) never collide on the same key even if a
 * caller happens to pass the same raw key string to both.
 *
 * Fails OPEN on any Redis error, same rationale as auth's
 * `rate-limit-redis.ts`: a flaky Redis should degrade rate-limiting, not
 * make the underlying feature (search, password reset) unavailable.
 */
export function createRedisFixedWindowLimiter(
  redis: RedisLike,
  opts: { max?: number; windowMs?: number; namespace: string },
): FixedWindowLimiter {
  const max = opts.max ?? 30;
  const windowMs = opts.windowMs ?? 60_000;
  const prefix = `docjob:fixed-window:${opts.namespace}`;

  return {
    async take(key) {
      try {
        const redisKey = `${prefix}:${key}`;
        const count = await redis.incr(redisKey);
        if (count === 1) {
          await redis.pexpire(redisKey, windowMs);
        }
        if (count > max) {
          const pttl = await redis.pttl(redisKey);
          const remainingMs = pttl > 0 ? pttl : windowMs;
          return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)) };
        }
        return { allowed: true, retryAfterSeconds: 0 };
      } catch (err) {
        console.error('[rate-limit-redis] take failed, failing open (allow)', err);
        return { allowed: true, retryAfterSeconds: 0 };
      }
    },
  };
}

/**
 * Selector: Redis-backed when `REDIS_URL` is set (`getRedis()` non-null),
 * else the original in-memory fixed-window limiter — the default,
 * backward-compatible single-VPS path. `namespace` is required so every
 * caller (the search router, the users-router reset-password throttle, ...)
 * gets its own Redis keyspace even though they all share one `getRedis()`
 * connection.
 */
export function getFixedWindowLimiter(opts: { max?: number; windowMs?: number; namespace: string }): FixedWindowLimiter {
  const redis = getRedis();
  return redis
    ? createRedisFixedWindowLimiter(redis, opts)
    : createFixedWindowLimiter({ max: opts.max, windowMs: opts.windowMs });
}
