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
 * calls. Genuinely implements the relevant Redis semantics (sorted-set score
 * pruning, string-key TTL expiry via `PTTL`) rather than returning canned
 * values, so these tests exercise the SAME window/lock logic a real Redis
 * server would enforce — this IS the "mocked ioredis" the SP-5 T4 brief asks
 * for, scoped to exactly the handful of commands this adapter issues.
 */
function makeFakeRedis(): RedisLike {
  const strings = new Map<string, { value: string; expiresAt: number }>();
  const zsets = new Map<string, Map<string, number>>(); // key -> member -> score

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
      if (!e) return -2;
      const remaining = e.expiresAt - Date.now();
      if (remaining <= 0) {
        strings.delete(key);
        return -2;
      }
      return remaining;
    },
    async zadd(key, score, member) {
      let z = zsets.get(key);
      if (!z) {
        z = new Map();
        zsets.set(key, z);
      }
      const isNew = !z.has(member);
      z.set(member, score);
      return isNew ? 1 : 0;
    },
    async zremrangebyscore(key, min, max) {
      const z = zsets.get(key);
      if (!z) return 0;
      const lo = min === '-inf' ? -Infinity : Number(min);
      const hi = max === '+inf' ? Infinity : Number(max);
      let n = 0;
      for (const [member, score] of [...z]) {
        if (score >= lo && score <= hi) {
          z.delete(member);
          n++;
        }
      }
      return n;
    },
    async zcard(key) {
      return zsets.get(key)?.size ?? 0;
    },
    async expire() {
      // Not exercised by these tests — the lock key's TTL (via `set ... EX`)
      // is what `check()` actually reads; the fail-set's EXPIRE is pure
      // Redis-side cleanup with no observable effect on check()/record().
      return 1;
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
      zadd: boom,
      zremrangebyscore: boom,
      zcard: boom,
      expire: boom,
    };
    const limiter = createRedisLimiter(redis);
    await expect(limiter.record('k', false)).resolves.toBeUndefined();
    expect(await limiter.check('k')).toEqual({ allowed: true, retryAfterSeconds: 0 });
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
    const zaddSpy = vi.spyOn(fake, 'zadd');
    getRedisMock.mockReturnValue(fake);
    const { getLoginLimiter } = await import('./rate-limit-redis');
    const limiter = getLoginLimiter({ maxAttempts: 1 });

    await limiter.record('k', false);
    expect(zaddSpy).toHaveBeenCalled();
  });
});
