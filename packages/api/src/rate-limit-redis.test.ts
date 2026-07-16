import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRedisFixedWindowLimiter, type RedisLike } from './rate-limit-redis';

// Top-level (not inside a describe/it) — vitest 4 warns if vi.mock/vi.hoisted
// are written anywhere else, since they're always hoisted above imports
// regardless of nesting and nesting them is misleading about execution order.
const { getRedisMock } = vi.hoisted(() => ({ getRedisMock: vi.fn() }));
vi.mock('@docjob/config', () => ({ getRedis: getRedisMock }));

/**
 * Minimal in-memory stand-in for the subset of ioredis
 * `createRedisFixedWindowLimiter` calls (`INCR`/`PEXPIRE`/`PTTL`).
 * Genuinely implements TTL expiry rather than returning canned values, so
 * these tests exercise the same window-reset behavior a real Redis server
 * would enforce.
 */
function makeFakeRedis(): RedisLike {
  const counters = new Map<string, { count: number; expiresAt: number | null }>();

  function prune(key: string) {
    const e = counters.get(key);
    if (e?.expiresAt !== null && e && e.expiresAt <= Date.now()) {
      counters.delete(key);
    }
  }

  return {
    async incr(key) {
      prune(key);
      const e = counters.get(key);
      if (!e) {
        counters.set(key, { count: 1, expiresAt: null });
        return 1;
      }
      e.count += 1;
      return e.count;
    },
    async pexpire(key, ms) {
      const e = counters.get(key);
      if (!e) return 0;
      e.expiresAt = Date.now() + ms;
      return 1;
    },
    async pttl(key) {
      prune(key);
      const e = counters.get(key);
      if (!e) return -2;
      if (e.expiresAt === null) return -1;
      return Math.max(0, e.expiresAt - Date.now());
    },
  };
}

describe('createRedisFixedWindowLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows up to max then blocks within the window', async () => {
    const rl = createRedisFixedWindowLimiter(makeFakeRedis(), { max: 3, windowMs: 60_000, namespace: 'test' });
    expect((await rl.take('u1')).allowed).toBe(true);
    expect((await rl.take('u1')).allowed).toBe(true);
    expect((await rl.take('u1')).allowed).toBe(true);
    const blocked = await rl.take('u1');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('keys are independent', async () => {
    const rl = createRedisFixedWindowLimiter(makeFakeRedis(), { max: 1, windowMs: 60_000, namespace: 'test' });
    expect((await rl.take('a')).allowed).toBe(true);
    expect((await rl.take('b')).allowed).toBe(true);
    expect((await rl.take('a')).allowed).toBe(false);
  });

  it('resets once the window elapses', async () => {
    vi.useFakeTimers();
    const rl = createRedisFixedWindowLimiter(makeFakeRedis(), { max: 1, windowMs: 1000, namespace: 'test' });
    expect((await rl.take('u1')).allowed).toBe(true);
    expect((await rl.take('u1')).allowed).toBe(false);

    vi.advanceTimersByTime(1001);
    expect((await rl.take('u1')).allowed).toBe(true);
  });

  it('two different namespaces sharing one Redis client do not collide on the same key', async () => {
    const redis = makeFakeRedis();
    const search = createRedisFixedWindowLimiter(redis, { max: 1, windowMs: 60_000, namespace: 'search' });
    const reset = createRedisFixedWindowLimiter(redis, { max: 1, windowMs: 60_000, namespace: 'reset-pw' });

    expect((await search.take('same-key')).allowed).toBe(true);
    // Would be `false` if both limiters wrote to the same Redis key.
    expect((await reset.take('same-key')).allowed).toBe(true);
  });

  it('fails open (allows) when the Redis client errors', async () => {
    const boom = async () => {
      throw new Error('redis unavailable');
    };
    const redis: RedisLike = { incr: boom, pexpire: boom, pttl: boom };
    const rl = createRedisFixedWindowLimiter(redis, { max: 1, windowMs: 60_000, namespace: 'test' });
    expect(await rl.take('k')).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });
});

describe('getFixedWindowLimiter selector', () => {
  afterEach(() => {
    getRedisMock.mockReset();
  });

  it('falls back to the in-memory limiter when REDIS_URL is unset (getRedis() -> null)', async () => {
    getRedisMock.mockReturnValue(null);
    const { getFixedWindowLimiter } = await import('./rate-limit-redis');
    const limiter = getFixedWindowLimiter({ max: 1, windowMs: 60_000, namespace: 'test' });

    expect((await limiter.take('k')).allowed).toBe(true);
    expect((await limiter.take('k')).allowed).toBe(false);
  });

  it('uses the Redis-backed limiter when getRedis() returns a client', async () => {
    const fake = makeFakeRedis();
    const incrSpy = vi.spyOn(fake, 'incr');
    getRedisMock.mockReturnValue(fake);
    const { getFixedWindowLimiter } = await import('./rate-limit-redis');
    const limiter = getFixedWindowLimiter({ max: 1, windowMs: 60_000, namespace: 'test' });

    await limiter.take('k');
    expect(incrSpy).toHaveBeenCalled();
  });
});
