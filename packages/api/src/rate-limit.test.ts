import { describe, it, expect, vi, afterEach } from 'vitest';
import { createFixedWindowLimiter, __createFixedWindowLimiterForTests } from './rate-limit';

describe('createFixedWindowLimiter', () => {
  it('allows up to max then blocks within the window', async () => {
    const rl = createFixedWindowLimiter({ max: 3, windowMs: 60_000 });
    expect((await rl.take('u1')).allowed).toBe(true);
    expect((await rl.take('u1')).allowed).toBe(true);
    expect((await rl.take('u1')).allowed).toBe(true);
    const blocked = await rl.take('u1');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('keys are independent', async () => {
    const rl = createFixedWindowLimiter({ max: 1, windowMs: 60_000 });
    expect((await rl.take('a')).allowed).toBe(true);
    expect((await rl.take('b')).allowed).toBe(true);
    expect((await rl.take('a')).allowed).toBe(false);
  });
});

describe('createFixedWindowLimiter — unbounded-key-space eviction (SP-5 T4)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('prunes expired windows once the store crosses the size threshold, without disturbing an active key', async () => {
    vi.useFakeTimers();
    // Test-only variant so we can observe `store.size` directly — this is
    // exactly what an unauthenticated, attacker-keyed limiter (e.g. the
    // reset-password limiter, keyed by `email:<attacker-supplied address>`)
    // looks like under a stream of one-off keys: each is used once and
    // never revisited.
    const rl = __createFixedWindowLimiterForTests({ max: 2, windowMs: 1_000 });

    for (let i = 0; i < 10_001; i++) {
      // eslint-disable-next-line no-await-in-loop
      await rl.take(`stale-${i}`);
    }
    expect(rl.storeSize()).toBe(10_001);

    // Let every one of those windows fully elapse.
    vi.advanceTimersByTime(1_500);

    // The very next `take()` — for a brand-new key — crosses
    // PRUNE_THRESHOLD and triggers the sweep. The stale entries (all
    // expired) are dropped; the new key being created in this same call is
    // NOT swept (it doesn't exist in `store` yet when the sweep runs).
    expect((await rl.take('active')).allowed).toBe(true);
    expect(rl.storeSize()).toBe(1);

    // The active key's own fixed-window limit logic is completely
    // unaffected by having just triggered a sweep of unrelated keys.
    expect((await rl.take('active')).allowed).toBe(true); // 2nd use, still under max=2
    const blocked = await rl.take('active');
    expect(blocked.allowed).toBe(false); // 3rd use, blocked
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(rl.storeSize()).toBe(1); // still just 'active' — no unbounded growth
  });
});
