import type { QueryEmbeddingCache } from './query-cache';

/**
 * Structural subset of `ioredis`'s client this adapter calls — a real
 * `Redis` instance (from `@docjob/config`'s `getRedis()`) satisfies this by
 * shape, and unit tests can pass a small hand-rolled fake instead of a live
 * connection. Deliberately only a `type`-imports `QueryEmbeddingCache` from
 * `./query-cache` (erased at compile time) — `query-cache.ts` imports this
 * module's `createRedisQueryCache` at the VALUE level, so a value-level
 * import in the other direction would create a circular dependency.
 */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<'OK' | null>;
}

const PREFIX = 'docjob:query-cache';

/**
 * Redis-backed `QueryEmbeddingCache` — `GET`/`SETEX` (via `SET ... EX`) of
 * the JSON-encoded embedding vector, TTL-scoped exactly like the in-memory
 * cache's `ttlMs` (default 1h). No client-side max-size eviction (unlike
 * the in-memory FIFO `max`) — Redis's own TTL expiry is the eviction
 * mechanism, appropriate for a shared, multi-instance cache where a hard
 * client-side cap doesn't map cleanly onto a shared keyspace.
 *
 * Fails soft on any Redis error: `get` treats it as a cache miss (falls
 * through to a real embedding call, same cost as a cold cache), `set`
 * silently skips the write — a flaky Redis degrades this to "every query
 * gets embedded fresh", not a broken search.
 */
export function createRedisQueryCache(redis: RedisLike, opts?: { ttlMs?: number }): QueryEmbeddingCache {
  const ttlSeconds = Math.max(1, Math.round((opts?.ttlMs ?? 60 * 60 * 1000) / 1000));
  const keyFor = (key: string) => `${PREFIX}:${key}`;

  return {
    async get(key) {
      try {
        const raw = await redis.get(keyFor(key));
        if (!raw) return undefined;
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) && parsed.every((n) => typeof n === 'number')
          ? (parsed as number[])
          : undefined;
      } catch (err) {
        console.error('[query-cache-redis] get failed, treating as a cache miss', err);
        return undefined;
      }
    },
    async set(key, vector) {
      try {
        await redis.set(keyFor(key), JSON.stringify(vector), 'EX', ttlSeconds);
      } catch (err) {
        console.error('[query-cache-redis] set failed, skipping cache write', err);
      }
    },
  };
}
