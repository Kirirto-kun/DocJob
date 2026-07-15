import { embedText } from './embeddings';

export interface QueryEmbeddingCache {
  get(key: string): number[] | undefined;
  set(key: string, vector: number[]): void;
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
    get(key) {
      const e = store.get(key);
      if (!e) return undefined;
      if (e.expiresAt <= Date.now()) { store.delete(key); return undefined; }
      return e.vector;
    },
    set(key, vector) {
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

// Module-level default cache shared across searchCases calls in a process.
const defaultCache = createInMemoryQueryCache();

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
  const hit = cache.get(key);
  if (hit) return hit;
  const vector = await embed(query);
  cache.set(key, vector);
  return vector;
}
