import { getRedis } from '@docjob/config';
import { embedText } from './embeddings';
import { createRedisQueryCache } from './query-cache-redis';

/**
 * SP-5 T4 note: both methods are `Promise`-returning even though the
 * in-memory implementation below never actually awaits anything internally
 * — a Redis-backed cache (`query-cache-redis.ts`) cannot answer `get`/`set`
 * without a network round trip, and there is no synchronous Redis client in
 * Node, so the interface has to be async for any backend to satisfy it.
 * `embedQueryCached`'s two call sites both already `await`.
 */
export interface QueryEmbeddingCache {
  get(key: string): Promise<number[] | undefined>;
  set(key: string, vector: number[]): Promise<void>;
}

interface Entry { vector: number[]; expiresAt: number; }

/**
 * TTL + max-size in-memory query-embedding cache. Behind an interface so SP-5
 * can swap a Redis-backed implementation without touching search.service (same
 * dependency-injection pattern as auth's AttemptLimiter). Cheap FIFO eviction
 * when `max` is exceeded — the query space is small and repetitive.
 */
export function createInMemoryQueryCache(opts?: { ttlMs?: number; max?: number }): QueryEmbeddingCache {
  const ttlMs = opts?.ttlMs ?? 60 * 60 * 1000; // 1h
  const max = opts?.max ?? 500;
  const store = new Map<string, Entry>();
  return {
    async get(key) {
      const e = store.get(key);
      if (!e) return undefined;
      if (e.expiresAt <= Date.now()) { store.delete(key); return undefined; }
      return e.vector;
    },
    async set(key, vector) {
      if (store.size >= max) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
      store.set(key, { vector, expiresAt: Date.now() + ttlMs });
    },
  };
}

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Module-level default cache shared across searchCases calls in a process.
 * SP-5 T4: Redis-backed (`query-cache-redis.ts`) when `REDIS_URL` is set —
 * every web/worker instance then shares one query-embedding cache instead
 * of each process warming its own — else the original in-memory
 * implementation, unchanged default for a single-VPS deploy. Evaluated once
 * at import time, same as before.
 */
const defaultCache: QueryEmbeddingCache = (() => {
  const redis = getRedis();
  return redis ? createRedisQueryCache(redis) : createInMemoryQueryCache();
})();

/**
 * Embed a query string, memoized by its normalized form. `embed` is injectable
 * for tests; production uses the real `embedText`.
 */
export async function embedQueryCached(
  query: string,
  cache: QueryEmbeddingCache = defaultCache,
  embed: (text: string) => Promise<number[]> = embedText,
): Promise<number[]> {
  const key = normalizeQuery(query);
  const hit = await cache.get(key);
  if (hit) return hit;
  const vector = await embed(query);
  await cache.set(key, vector);
  return vector;
}
