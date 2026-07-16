import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRedisLimiter, type RedisLike } from './rate-limit-redis';

// Top-level (not inside a describe/it) so vitest's static hoisting sees them
// in their real execution position — vi.mock/vi.hoisted calls are always
// hoisted above imports regardless of nesting, but vitest 4 warns (and a
// future version errors) if they're written anywhere but the module's top
// level, since nesting them is misleading about when they actually run.
const { getRedisMock } = vi.hoisted(() => ({ getRedisMock: vi.fn() }));
vi.mock('@docjob/config', () => ({ getRedis: getRedisMock }));

/**
 * Minimal in-memory stand-in for the subset of ioredis `createRedisLimiter`
 * calls — `set`/`del`/`pttl` directly, plus a single `EVAL` running the
 * adapter's `RECORD_FAILURE_SCRIPT` (atomic ZADD + prune-by-score + EXPIRE +
 * ZCARD, all in one round trip). A JS engine obviously can't execute real
 * Lua, so this fake hard-codes that ONE script's semantics — genuinely
 * implementing the relevant Redis semantics (sorted-set score pruning,
 * TTL expiry via `PTTL` for both string keys AND the fail-set) rather than
 * returning canned values, so these tests exercise the SAME window/lock
 * logic a real Redis server would enforce, including that the fail-set's
 * add and its TTL land together atomically — this IS the "mocked ioredis"
 * the SP-5 T4 brief asks for, scoped to exactly the handful of commands
 * this adapter issues.
 */
function makeFakeRedis(): RedisLike {
  const strings = new Map<string, { value: string; expiresAt: number }>();
  const zsets = new Map<string, { members: Map<string, number>; expiresAt: number | null }>();

  function pruneZset(key: string) {
    const z = zsets.get(key);
    if (z && z.expiresAt !== null && z.expiresAt <= Date.now()) {
      zsets.delete(key);
    }
  }

  return {
    async set(key, value, _mode, seconds) {
      strings.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
      return 'OK';
    },
    async del(...keys) {
      let n = 0;
      for (const k of keys) {
        if (strings.delete(k)) n++;
        if (zsets.delete(k)) n++;
      }
      return n;
    },
    async pttl(key) {
      const e = strings.get(key);
      if (e) {
        const remaining = e.expiresAt - Date.now();
        if (remaining <= 0) {
          strings.delete(key);
          return -2;
        }
        return remaining;
      }
      pruneZset(key);
      const z = zsets.get(key);
      if (!z) return -2;
      if (z.expiresAt === null) return -1;
      return Math.max(0, z.expiresAt - Date.now());
    },
    async eval(_script, _numkeys, ...args) {
      // Mirrors RECORD_FAILURE_SCRIPT exactly: KEYS[1]=args[0] (the
      // fail-set key), ARGV[1..4]=args[1..4] (score, member, windowStart,
      // ttlSeconds) — see rate-limit-redis.ts's call site.
      const key = String(args[0]);
      const score = Number(args[1]);
      const member = String(args[2]);
      const windowStart = Number(args[3]);
      const ttlSeconds = Number(args[4]);

      pruneZset(key);
      let z = zsets.get(key);
      if (!z) {
        z = { members: new Map(), expiresAt: null };
        zsets.set(key, z);
      }
      // ZADD
      z.members.set(member, score);
      // ZREMRANGEBYSCORE '-inf' windowStart (inclusive)
      for (const [m, s] of [...z.members]) {
        if (s <= windowStart) z.members.delete(m);
      }
      // EXPIRE — set in the SAME atomic step as the ZADD above. This is
      // exactly the gap SP-5 T4 closes: a real two-round-trip ZADD-then-
      // EXPIRE could have the connection drop in between, leaving a
      // stranded fail-set with members but no TTL.
      z.expiresAt = Date.now() + ttlSeconds * 1000;
      // ZCARD
      return z.members.size;
    },
  };
}

describe('createRedisLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows a key with no recorded attempts', async () => {
    const limiter = createRedisLimiter(makeFakeRedis());
    expect(await limiter.check('k')).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it('allows up to maxAttempts-1 failures, then locks once the threshold is crossed', async () => {
    const limiter = createRedisLimiter(makeFakeRedis(), { maxAttempts: 3, windowSeconds: 60, lockSeconds: 30 });
    await limiter.record('k', false);
    await limiter.record('k', false);
    expect((await limiter.check('k')).allowed).toBe(true);

    await limiter.record('k', false); // 3rd failure crosses maxAttempts
    const result = await limiter.check('k');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(30);
  });

  it('a success clears prior failures and any lock', async () => {
    const limiter = createRedisLimiter(makeFakeRedis(), { maxAttempts: 2, windowSeconds: 60, lockSeconds: 30 });
    await limiter.record('k', false);
    await limiter.record('k', true);
    await limiter.record('k', false);
    expect((await limiter.check('k')).allowed).toBe(true);
  });

  it('unlocks automatically once lockSeconds has elapsed (Redis TTL expiry)', async () => {
    vi.useFakeTimers();
    const limiter = createRedisLimiter(makeFakeRedis(), { maxAttempts: 1, windowSeconds: 60, lockSeconds: 5 });
    await limiter.record('k', false);
    expect((await limiter.check('k')).allowed).toBe(false);

    vi.advanceTimersByTime(5001);
    expect((await limiter.check('k')).allowed).toBe(true);
  });

  it('prunes failures that have aged out of the sliding window', async () => {
    vi.useFakeTimers();
    const limiter = createRedisLimiter(makeFakeRedis(), { maxAttempts: 3, windowSeconds: 5, lockSeconds: 30 });
    await limiter.record('k', false);
    await limiter.record('k', false);

    vi.advanceTimersByTime(5001);
    await limiter.record('k', false); // only 1 failure "in window" now

    expect((await limiter.check('k')).allowed).toBe(true);
  });

  it('keys are independent of one another', async () => {
    const limiter = createRedisLimiter(makeFakeRedis(), { maxAttempts: 1, windowSeconds: 60, lockSeconds: 30 });
    await limiter.record('a', false);
    expect((await limiter.check('a')).allowed).toBe(false);
    expect((await limiter.check('b')).allowed).toBe(true);
  });

  it('fails open (allows) when the Redis client errors, and record() never throws', async () => {
    const boom = async () => {
      throw new Error('redis unavailable');
    };
    const redis: RedisLike = {
      set: boom,
      del: boom,
      pttl: boom,
      eval: boom,
    };
    const limiter = createRedisLimiter(redis);
    await expect(limiter.record('k', false)).resolves.toBeUndefined();
    expect(await limiter.check('k')).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  // SP-5 T4 robustness fix: ZADD and EXPIRE used to be two separate Redis
  // round trips (plus ZREMRANGEBYSCORE and ZCARD). If the connection
  // dropped between the ZADD and the EXPIRE, the fail-set was left with a
  // member in it and NO expiry, forever. Asserting on `eval` (rather than
  // separate zadd/expire/zcard spies, which no longer exist on the
  // adapter's `RedisLike` surface) proves the fix: exactly one Redis
  // command per failed `record()`, and the fail-set's TTL is set in that
  // SAME atomic step as its first member being added.
  it('the fail-set count+ttl semantics match the old ZADD+EXPIRE version, but via one atomic script call', async () => {
    const redis = makeFakeRedis();
    const evalSpy = vi.spyOn(redis, 'eval');
    const limiter = createRedisLimiter(redis, { maxAttempts: 5, windowSeconds: 60, lockSeconds: 30 });

    await limiter.record('k', false);
    expect(evalSpy).toHaveBeenCalledTimes(1);
    // Exactly one round trip issued for this failure — the script itself,
    // not zadd-then-zremrangebyscore-then-expire-then-zcard as four calls.
    const [scriptArg, numkeysArg] = evalSpy.mock.calls[0]!;
    expect(typeof scriptArg).toBe('string');
    expect(numkeysArg).toBe(1);

    // The fail-set gets a TTL in the SAME atomic step as its first ZADD —
    // there is no observable "member added, no TTL" state (the bug this
    // fix closes). `pttl` here reads the fake's zset-TTL path directly.
    expect(await redis.pttl('docjob:login-limiter:fail:k')).toBeGreaterThan(0);
  });
});

describe('getLoginLimiter selector', () => {
  afterEach(() => {
    getRedisMock.mockReset();
  });

  it('falls back to the in-memory limiter when REDIS_URL is unset (getRedis() -> null)', async () => {
    getRedisMock.mockReturnValue(null);
    const { getLoginLimiter } = await import('./rate-limit-redis');
    const limiter = getLoginLimiter({ maxAttempts: 1 });

    // Proves it's the real in-memory limiter (with actual lock semantics),
    // not a stub — a single failure locks the key immediately.
    await limiter.record('k', false);
    expect((await limiter.check('k')).allowed).toBe(false);
  });

  it('uses the Redis-backed limiter when getRedis() returns a client', async () => {
    const fake = makeFakeRedis();
    const evalSpy = vi.spyOn(fake, 'eval');
    getRedisMock.mockReturnValue(fake);
    const { getLoginLimiter } = await import('./rate-limit-redis');
    const limiter = getLoginLimiter({ maxAttempts: 1 });

    await limiter.record('k', false);
    expect(evalSpy).toHaveBeenCalled();
  });
});
