import { getRedis } from '@docjob/config';
import { createInMemoryLimiter, type AttemptLimiter } from './rate-limit';

/**
 * Structural subset of `ioredis`'s client this adapter calls — a real
 * `Redis` instance (from `getRedis()`) satisfies this by shape, and unit
 * tests can pass a small hand-rolled fake instead of a live connection
 * (`rate-limit-redis.test.ts`) without depending on ioredis's ~200-method
 * surface or a real server.
 */
export interface RedisLike {
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<'OK' | null>;
  del(...keys: string[]): Promise<number>;
  pttl(key: string): Promise<number>;
  zadd(key: string, score: number, member: string): Promise<number>;
  zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number>;
  zcard(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

const PREFIX = 'docjob:login-limiter';

/**
 * Redis-backed `AttemptLimiter` — a sliding window via a per-key sorted set
 * (`ZADD`/`ZREMRANGEBYSCORE`/`ZCARD`) mirroring `createInMemoryLimiter`'s
 * semantics exactly: N failures inside `windowSeconds` triggers a lock for
 * `lockSeconds`, a success clears both the failure history and any lock,
 * and the lock auto-expires (`SET ... EX lockSeconds` + `PTTL` on `check`,
 * instead of storing/comparing a `lockedUntil` timestamp ourselves — Redis's
 * own TTL is the source of truth for "is this key still locked").
 *
 * Multi-instance correct by construction: every web process sharing this
 * Redis backend sees the same failure count / lock state for a given
 * `ip:`/`email:` key, unlike the in-memory limiter (correct only for a
 * single process).
 *
 * Fails OPEN on any Redis error (connection down, timeout, ...): `check`
 * returns `allowed: true` and `record` swallows the error, both logging via
 * `console.error`. Rationale: a flaky/unreachable Redis should degrade
 * login availability gracefully (an attacker briefly unthrottled during an
 * outage) rather than making login itself unavailable — the same tradeoff
 * `packages/config/src/redis.ts` documents for the client's own connection
 * handling.
 */
export function createRedisLimiter(
  redis: RedisLike,
  opts?: { maxAttempts?: number; windowSeconds?: number; lockSeconds?: number },
): AttemptLimiter {
  const maxAttempts = opts?.maxAttempts ?? 5;
  const windowSeconds = opts?.windowSeconds ?? 60;
  const lockSeconds = opts?.lockSeconds ?? 300;

  const failKey = (key: string) => `${PREFIX}:fail:${key}`;
  const lockKey = (key: string) => `${PREFIX}:lock:${key}`;

  return {
    async check(key) {
      try {
        const pttl = await redis.pttl(lockKey(key));
        if (pttl > 0) {
          return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(pttl / 1000)) };
        }
        return { allowed: true, retryAfterSeconds: 0 };
      } catch (err) {
        console.error('[rate-limit-redis] check failed, failing open (allow)', err);
        return { allowed: true, retryAfterSeconds: 0 };
      }
    },
    async record(key, success) {
      try {
        if (success) {
          await Promise.all([redis.del(failKey(key)), redis.del(lockKey(key))]);
          return;
        }
        const now = Date.now();
        const windowStart = now - windowSeconds * 1000;
        // Score AND member both encode the timestamp, but the member also
        // gets a random suffix — two failures landing in the same
        // millisecond must not collide into a single sorted-set entry
        // (ZADD replaces the score of an existing member, which would
        // silently undercount).
        const member = `${now}-${Math.random().toString(36).slice(2)}`;
        await redis.zadd(failKey(key), now, member);
        await redis.zremrangebyscore(failKey(key), '-inf', windowStart);
        // Self-cleanup: a key nobody touches again should not live in Redis
        // forever. windowSeconds is enough — once the window has fully
        // elapsed the sorted set is empty anyway.
        await redis.expire(failKey(key), windowSeconds);
        const count = await redis.zcard(failKey(key));
        if (count >= maxAttempts) {
          await redis.set(lockKey(key), '1', 'EX', lockSeconds);
        }
      } catch (err) {
        console.error('[rate-limit-redis] record failed', err);
      }
    },
  };
}

/**
 * Selector: Redis-backed when `REDIS_URL` is set (`getRedis()` non-null),
 * else the original in-memory limiter — the default, backward-compatible
 * single-VPS path. Used by `login.service.ts`'s `defaultLimiter` and the web
 * login route (`apps/web/src/app/api/auth/login/route.ts`) so both entry
 * points pick up the same backend without either importing `ioredis`
 * directly.
 */
export function getLoginLimiter(opts?: {
  maxAttempts?: number;
  windowSeconds?: number;
  lockSeconds?: number;
}): AttemptLimiter {
  const redis = getRedis();
  return redis ? createRedisLimiter(redis, opts) : createInMemoryLimiter(opts);
}
