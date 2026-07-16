import { getRedis } from '@docjob/config';
import { createFixedWindowLimiter, type FixedWindowLimiter } from './rate-limit';

/**
 * Structural subset of `ioredis`'s client this adapter calls — a real
 * `Redis` instance (from `getRedis()`) satisfies this by shape, and unit
 * tests can pass a small hand-rolled fake instead of a live connection.
 */
export interface RedisLike {
  eval(script: string, numkeys: number, ...args: Array<string | number>): Promise<unknown>;
}

/**
 * `INCR` + conditional `PEXPIRE` (only on the window's first increment,
 * matching `createFixedWindowLimiter`'s "window resets when it naturally
 * expires" semantics) as ONE atomic round trip, returning `{count, pttl}` in
 * one reply.
 *
 * SP-5 T4 robustness fix: this used to be `INCR` then a separate `PEXPIRE`
 * call. If the connection dropped between the two (or the process crashed),
 * a brand-new key was left with `count = 1` and NO expiry — every later
 * request would `INCR` it past `max` and it would never expire, permanently
 * blocking that key (e.g. `search:<actorId>`, `reset-pw:email:<addr>`) until
 * someone manually deleted it in Redis, surviving restarts. Running both
 * commands inside a single Lua script makes Redis execute them as one
 * atomic operation — there is no window between them for a dropped
 * connection to land in.
 */
const INCR_WITH_TTL_SCRIPT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return {n, redis.call('PTTL', KEYS[1])}
`;

/**
 * Redis-backed fixed-window limiter — atomic INCR+PEXPIRE via
 * `INCR_WITH_TTL_SCRIPT` (see above), same `.take(key)` shape as the
 * in-memory version. The script is atomic server-side, so exactly one
 * caller ever observes `count === 1` for a given window even under
 * concurrent requests from multiple web instances — no separate lock
 * needed.
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
        const result = (await redis.eval(INCR_WITH_TTL_SCRIPT, 1, redisKey, windowMs)) as [
          number | string,
          number | string,
        ];
        const count = Number(result[0]);
        const pttl = Number(result[1]);
        if (count > max) {
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
