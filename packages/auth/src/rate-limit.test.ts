import { describe, it, expect, vi, afterEach } from 'vitest';
import { createInMemoryLimiter } from './rate-limit';

describe('createInMemoryLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows a key with no recorded attempts', () => {
    const limiter = createInMemoryLimiter();
    expect(limiter.check('k')).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it('allows up to maxAttempts-1 failures, then locks once the threshold is crossed', () => {
    const limiter = createInMemoryLimiter({ maxAttempts: 3, windowSeconds: 60, lockSeconds: 30 });
    limiter.record('k', false);
    limiter.record('k', false);
    expect(limiter.check('k').allowed).toBe(true);

    limiter.record('k', false); // 3rd failure crosses maxAttempts
    const result = limiter.check('k');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(30);
  });

  it('a success clears prior failures and any lock', () => {
    const limiter = createInMemoryLimiter({ maxAttempts: 2, windowSeconds: 60, lockSeconds: 30 });
    limiter.record('k', false);
    limiter.record('k', true);
    limiter.record('k', false);
    // Only 1 failure since the success reset the window, so still under maxAttempts.
    expect(limiter.check('k').allowed).toBe(true);
  });

  it('unlocks automatically once lockSeconds has elapsed', () => {
    vi.useFakeTimers();
    const limiter = createInMemoryLimiter({ maxAttempts: 1, windowSeconds: 60, lockSeconds: 5 });
    limiter.record('k', false);
    expect(limiter.check('k').allowed).toBe(false);

    vi.advanceTimersByTime(5001);
    expect(limiter.check('k').allowed).toBe(true);
  });

  it('prunes failures that have aged out of the sliding window', () => {
    vi.useFakeTimers();
    const limiter = createInMemoryLimiter({ maxAttempts: 3, windowSeconds: 5, lockSeconds: 30 });
    limiter.record('k', false);
    limiter.record('k', false);

    vi.advanceTimersByTime(5001); // both prior failures age out of the 5s window
    limiter.record('k', false); // only 1 failure "in window" now

    expect(limiter.check('k').allowed).toBe(true);
  });

  it('keys are independent of one another', () => {
    const limiter = createInMemoryLimiter({ maxAttempts: 1, windowSeconds: 60, lockSeconds: 30 });
    limiter.record('a', false);
    expect(limiter.check('a').allowed).toBe(false);
    expect(limiter.check('b').allowed).toBe(true);
  });

  it('two independent limiter instances do not share state', () => {
    const a = createInMemoryLimiter({ maxAttempts: 1 });
    const b = createInMemoryLimiter({ maxAttempts: 1 });
    a.record('k', false);
    expect(a.check('k').allowed).toBe(false);
    expect(b.check('k').allowed).toBe(true);
  });
});
