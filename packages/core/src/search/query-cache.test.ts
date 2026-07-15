import { describe, it, expect, vi } from 'vitest';
import { createInMemoryQueryCache, embedQueryCached } from './query-cache';

describe('query embedding cache', () => {
  it('reuses a cached vector for the same normalized query', async () => {
    const cache = createInMemoryQueryCache();
    const embed = vi.fn(async () => [0.1, 0.2]);
    // embedQueryCached takes an injectable embedder for testability.
    const a = await embedQueryCached('  Инфаркт ', cache, embed);
    const b = await embedQueryCached('инфаркт', cache, embed); // normalized → same key
    expect(a).toEqual(b);
    expect(embed).toHaveBeenCalledTimes(1);
  });

  it('evicts after TTL', async () => {
    vi.useFakeTimers();
    const cache = createInMemoryQueryCache({ ttlMs: 1000 });
    const embed = vi.fn(async () => [0.3]);
    await embedQueryCached('x', cache, embed);
    vi.advanceTimersByTime(1500);
    await embedQueryCached('x', cache, embed);
    expect(embed).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
