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
  eval(script: string, numkeys: number, ...args: Array<string | number>): Promise<unknown>;
}

const PREFIX = 'docjob:login-limiter';

/**
 * Records one failure into the per-key sorted set, prunes anything that has
 * aged out of the sliding window, and (re-)sets the set's own TTL — all in
 * one atomic Lua script — then returns the post-prune failure count.
 *
 * SP-5 T4 robustness fix: this used to be four separate round trips
 * (`ZADD`, `ZREMRANGEBYSCORE`, `EXPIRE`, `ZCARD`). If the connection dropped
 * between the `ZADD` and the `EXPIRE`, the fail-set was left with a member
 * in it and NO expiry — same "stranded key" shape as the fixed-window
 * limiter's INCR/PEXPIRE gap (see `packages/api/src/rate-limit-redis.ts`),
 * just for the failure-tracking key instead of the lock key: it would sit
 * in Redis forever once its owner (an IP/email that stops attempting)
 * stopped touching it, since only a *future* write re-runs the prune step.
 * A single script closes that gap — Redis executes the whole body as one
 * atomic operation, so there is no window for a dropped connection to land
 * in between the add and the expire.
 */
const RECORD_FAILURE_SCRIPT = `
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[4])
return redis.call('ZCARD', KEYS[1])
`;

/**
 * Redis-backed `AttemptLimiter` — a sliding window via a per-key sorted set
 * (`ZADD`/`ZREMRANGEBYSCORE`/`ZCARD`, atomically via `RECORD_FAILURE_SCRIPT`)
 * mirroring `createInMemoryLimiter`'s semantics exactly: N failures inside
 * `windowSeconds` triggers a lock for
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
        // Add + prune + self-cleanup TTL + count, all as one atomic script
        // (see RECORD_FAILURE_SCRIPT above) — a key nobody touches again
        // should not live in Redis forever, and the add and the TTL must
        // land together or not at all.
        const count = Number(
          await redis.eval(RECORD_FAILURE_SCRIPT, 1, failKey(key), now, member, windowStart, windowSeconds),
        );
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
