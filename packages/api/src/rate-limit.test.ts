import { describe, it, expect } from 'vitest';
import { createFixedWindowLimiter } from './rate-limit';

describe('createFixedWindowLimiter', () => {
  it('allows up to max then blocks within the window', () => {
    const rl = createFixedWindowLimiter({ max: 3, windowMs: 60_000 });
    expect(rl.take('u1').allowed).toBe(true);
    expect(rl.take('u1').allowed).toBe(true);
    expect(rl.take('u1').allowed).toBe(true);
    const blocked = rl.take('u1');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('keys are independent', () => {
    const rl = createFixedWindowLimiter({ max: 1, windowMs: 60_000 });
    expect(rl.take('a').allowed).toBe(true);
    expect(rl.take('b').allowed).toBe(true);
    expect(rl.take('a').allowed).toBe(false);
  });
});
