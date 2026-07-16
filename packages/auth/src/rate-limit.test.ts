import { describe, it, expect, vi, afterEach } from 'vitest';
import { createInMemoryLimiter } from './rate-limit';

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
