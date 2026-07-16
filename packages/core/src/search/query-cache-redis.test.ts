import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRedisQueryCache, type RedisLike } from './query-cache-redis';

// Top-level (not inside a describe/it) — vitest 4 warns if vi.mock/vi.hoisted
// are written anywhere else, since they're always hoisted above imports
// regardless of nesting and nesting them is misleading about execution order.
const { getRedisMock } = vi.hoisted(() => ({ getRedisMock: vi.fn() }));
vi.mock('@docjob/config', () => ({ getRedis: getRedisMock }));

/**
 * Minimal in-memory stand-in for the subset of ioredis `createRedisQueryCache`
 * calls (`GET`/`SET ... EX`). Genuinely implements TTL expiry rather than
 * returning canned values, so these tests exercise the same expiry behavior
 * a real Redis server would enforce.
 */
function makeFakeRedis(): RedisLike {
  const store = new Map<string, { value: string; expiresAt: number }>();
  return {
    async get(key) {
      const e = store.get(key);
      if (!e) return null;
      if (e.expiresAt <= Date.now()) {
        store.delete(key);
        return null;
      }
      return e.value;
    },
    async set(key, value, _mode, seconds) {
      store.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
      return 'OK';
    },
  };
}

describe('createRedisQueryCache', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns undefined for a key that was never set', async () => {
    const cache = createRedisQueryCache(makeFakeRedis());
    expect(await cache.get('x')).toBeUndefined();
  });

  it('round-trips a vector through JSON-encoded GET/SET', async () => {
    const cache = createRedisQueryCache(makeFakeRedis());
    await cache.set('инфаркт', [0.1, 0.2, 0.3]);
    expect(await cache.get('инфаркт')).toEqual([0.1, 0.2, 0.3]);
  });

  it('evicts after the TTL elapses', async () => {
    vi.useFakeTimers();
    const cache = createRedisQueryCache(makeFakeRedis(), { ttlMs: 1000 });
    await cache.set('x', [0.3]);
    expect(await cache.get('x')).toEqual([0.3]);

    vi.advanceTimersByTime(1500);
    expect(await cache.get('x')).toBeUndefined();
  });

  it('get() fails soft (undefined) when the Redis client errors', async () => {
    const redis: RedisLike = {
      get: async () => {
        throw new Error('redis unavailable');
      },
      set: async () => {
        throw new Error('redis unavailable');
      },
    };
    const cache = createRedisQueryCache(redis);
    expect(await cache.get('x')).toBeUndefined();
    await expect(cache.set('x', [1])).resolves.toBeUndefined();
  });

  it('get() treats a malformed stored value (not a number array) as a miss', async () => {
    const redis: RedisLike = {
      get: async () => JSON.stringify({ not: 'a vector' }),
      set: async () => 'OK',
    };
    const cache = createRedisQueryCache(redis);
    expect(await cache.get('x')).toBeUndefined();
  });
});

describe('query-cache.ts default cache selector (fallback)', () => {
  afterEach(() => {
    getRedisMock.mockReset();
    vi.resetModules();
  });

  it('embedQueryCached still works end-to-end when REDIS_URL is unset (getRedis() -> null, in-memory default)', async () => {
    getRedisMock.mockReturnValue(null);
    const { embedQueryCached, createInMemoryQueryCache } = await import('./query-cache');
    const cache = createInMemoryQueryCache();
    const embed = vi.fn(async () => [0.5, 0.6]);

    const a = await embedQueryCached('пневмония', cache, embed);
    const b = await embedQueryCached('пневмония', cache, embed);
    expect(a).toEqual(b);
    expect(embed).toHaveBeenCalledTimes(1);
  });

  it("query-cache.ts's module-level default is Redis-backed when getRedis() returns a client at import time", async () => {
    const fake = makeFakeRedis();
    const getSpy = vi.spyOn(fake, 'get');
    getRedisMock.mockReturnValue(fake);

    // The default cache is built once at module load, so re-importing
    // after mockReturnValue is what makes this deterministic.
    const { embedQueryCached } = await import('./query-cache');
    const embed = vi.fn(async () => [0.7]);

    await embedQueryCached('редкий запрос без явного кэша', undefined, embed);
    expect(getSpy).toHaveBeenCalled();
  });
});
