import { describe, it, expect, vi, afterEach } from 'vitest';
import { createInMemoryLimiter, __createInMemoryLimiterForTests } from './rate-limit';

describe('createInMemoryLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows a key with no recorded attempts', async () => {
    const limiter = createInMemoryLimiter();
    expect(await limiter.check('k')).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it('allows up to maxAttempts-1 failures, then locks once the threshold is crossed', async () => {
    const limiter = createInMemoryLimiter({ maxAttempts: 3, windowSeconds: 60, lockSeconds: 30 });
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
    const limiter = createInMemoryLimiter({ maxAttempts: 2, windowSeconds: 60, lockSeconds: 30 });
    await limiter.record('k', false);
    await limiter.record('k', true);
    await limiter.record('k', false);
    // Only 1 failure since the success reset the window, so still under maxAttempts.
    expect((await limiter.check('k')).allowed).toBe(true);
  });

  it('unlocks automatically once lockSeconds has elapsed', async () => {
    vi.useFakeTimers();
    const limiter = createInMemoryLimiter({ maxAttempts: 1, windowSeconds: 60, lockSeconds: 5 });
    await limiter.record('k', false);
    expect((await limiter.check('k')).allowed).toBe(false);

    vi.advanceTimersByTime(5001);
    expect((await limiter.check('k')).allowed).toBe(true);
  });

  it('prunes failures that have aged out of the sliding window', async () => {
    vi.useFakeTimers();
    const limiter = createInMemoryLimiter({ maxAttempts: 3, windowSeconds: 5, lockSeconds: 30 });
    await limiter.record('k', false);
    await limiter.record('k', false);

    vi.advanceTimersByTime(5001); // both prior failures age out of the 5s window
    await limiter.record('k', false); // only 1 failure "in window" now

    expect((await limiter.check('k')).allowed).toBe(true);
  });

  it('keys are independent of one another', async () => {
    const limiter = createInMemoryLimiter({ maxAttempts: 1, windowSeconds: 60, lockSeconds: 30 });
    await limiter.record('a', false);
    expect((await limiter.check('a')).allowed).toBe(false);
    expect((await limiter.check('b')).allowed).toBe(true);
  });

  it('two independent limiter instances do not share state', async () => {
    const a = createInMemoryLimiter({ maxAttempts: 1 });
    const b = createInMemoryLimiter({ maxAttempts: 1 });
    await a.record('k', false);
    expect((await a.check('k')).allowed).toBe(false);
    expect((await b.check('k')).allowed).toBe(true);
  });
});

describe('createInMemoryLimiter — unbounded-key-space eviction (SP-5 T4)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('prunes dead entries once the store crosses the size threshold, without disturbing a locked key', async () => {
    vi.useFakeTimers();
    // Test-only variant exposing `store.size` — mirrors an unauthenticated,
    // attacker-keyed limiter (login's `ip:<addr>` / `email:<addr>` keys)
    // under a stream of one-off keys tried once and never revisited.
    const rl = __createInMemoryLimiterForTests({ maxAttempts: 3, windowSeconds: 1, lockSeconds: 30 });

    for (let i = 0; i < 10_001; i++) {
      // eslint-disable-next-line no-await-in-loop
      await rl.record(`stale-${i}`, false);
    }
    expect(rl.storeSize()).toBe(10_001);

    // Let every one of those failure windows fully elapse (no lock was ever
    // triggered — a single failure each, below maxAttempts).
    vi.advanceTimersByTime(1_500);

    // The next `record()` — for a brand-new key — crosses PRUNE_THRESHOLD
    // and triggers the sweep. The stale entries (no active lock, no
    // in-window failures) are dropped.
    await rl.record('locked', false);
    await rl.record('locked', false);
    await rl.record('locked', false); // 3rd failure crosses maxAttempts -> locks
    expect(rl.storeSize()).toBe(1);

    // The locked key's own lock semantics are unaffected by having just
    // triggered a sweep of unrelated keys.
    const result = await rl.check('locked');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(rl.storeSize()).toBe(1); // still just 'locked' — no unbounded growth
  });
});
