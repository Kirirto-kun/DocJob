import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRedisFixedWindowLimiter, type RedisLike } from './rate-limit-redis';

// Top-level (not inside a describe/it) — vitest 4 warns if vi.mock/vi.hoisted
// are written anywhere else, since they're always hoisted above imports
// regardless of nesting and nesting them is misleading about execution order.
const { getRedisMock } = vi.hoisted(() => ({ getRedisMock: vi.fn() }));
vi.mock('@docjob/config', () => ({ getRedis: getRedisMock }));

/**
 * Minimal in-memory stand-in for the subset of ioredis
 * `createRedisFixedWindowLimiter` calls — a single `EVAL` running the
 * adapter's `INCR_WITH_TTL_SCRIPT` (atomic INCR + conditional PEXPIRE +
 * PTTL, all in one round trip). A JS engine obviously can't execute real
 * Lua, so this fake hard-codes that ONE script's semantics — genuinely
 * implementing INCR/TTL expiry rather than returning canned values, so
 * these tests exercise the same window-reset (and, critically, the same
 * atomic "count and TTL move together") behavior a real Redis server would
 * enforce for this adapter.
 */
function makeFakeRedis(): RedisLike {
  const counters = new Map<string, { count: number; expiresAt: number | null }>();

  function prune(key: string) {
    const e = counters.get(key);
    if (e?.expiresAt !== null && e && e.expiresAt <= Date.now()) {
      counters.delete(key);
    }
  }

  return {
    async eval(_script, _numkeys, ...args) {
      const key = String(args[0]);
      const windowMs = Number(args[1]);
      prune(key);
      let e = counters.get(key);
      if (!e) {
        // First INCR of a fresh window: count starts at 1 AND the TTL is
        // set in the same atomic step — there is no observable moment
        // where count=1 exists without a TTL, which is exactly the bug
        // this script closes (see INCR_WITH_TTL_SCRIPT's doc comment).
        e = { count: 1, expiresAt: Date.now() + windowMs };
        counters.set(key, e);
      } else {
        e.count += 1;
      }
      const pttl = e.expiresAt === null ? -1 : Math.max(0, e.expiresAt - Date.now());
      return [e.count, pttl];
    },
  };
}

describe('createRedisFixedWindowLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows up to max then blocks within the window', async () => {
    const rl = createRedisFixedWindowLimiter(makeFakeRedis(), { max: 3, windowMs: 60_000, namespace: 'test' });
    expect((await rl.take('u1')).allowed).toBe(true);
    expect((await rl.take('u1')).allowed).toBe(true);
    expect((await rl.take('u1')).allowed).toBe(true);
    const blocked = await rl.take('u1');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('keys are independent', async () => {
    const rl = createRedisFixedWindowLimiter(makeFakeRedis(), { max: 1, windowMs: 60_000, namespace: 'test' });
    expect((await rl.take('a')).allowed).toBe(true);
    expect((await rl.take('b')).allowed).toBe(true);
    expect((await rl.take('a')).allowed).toBe(false);
  });

  it('resets once the window elapses', async () => {
    vi.useFakeTimers();
    const rl = createRedisFixedWindowLimiter(makeFakeRedis(), { max: 1, windowMs: 1000, namespace: 'test' });
    expect((await rl.take('u1')).allowed).toBe(true);
    expect((await rl.take('u1')).allowed).toBe(false);

    vi.advanceTimersByTime(1001);
    expect((await rl.take('u1')).allowed).toBe(true);
  });

  it('two different namespaces sharing one Redis client do not collide on the same key', async () => {
    const redis = makeFakeRedis();
    const search = createRedisFixedWindowLimiter(redis, { max: 1, windowMs: 60_000, namespace: 'search' });
    const reset = createRedisFixedWindowLimiter(redis, { max: 1, windowMs: 60_000, namespace: 'reset-pw' });

    expect((await search.take('same-key')).allowed).toBe(true);
    // Would be `false` if both limiters wrote to the same Redis key.
    expect((await reset.take('same-key')).allowed).toBe(true);
  });

  it('fails open (allows) when the Redis client errors', async () => {
    const boom = async () => {
      throw new Error('redis unavailable');
    };
    const redis: RedisLike = { eval: boom };
    const rl = createRedisFixedWindowLimiter(redis, { max: 1, windowMs: 60_000, namespace: 'test' });
    expect(await rl.take('k')).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  // SP-5 T4 robustness fix: INCR and PEXPIRE used to be two separate Redis
  // round trips. If the connection dropped between them, a brand-new key
  // was left with count=1 and NO expiry forever. Asserting on `eval` calls
  // (rather than separate incr/pexpire spies, which no longer exist on the
  // adapter's `RedisLike` surface) proves the fix: exactly one Redis
  // command per `take()`, and the returned count+ttl semantics are
  // unchanged from the old two-command version.
  it('the count+ttl semantics match the old INCR+PEXPIRE version, but via one atomic script call', async () => {
    const redis = makeFakeRedis();
    const evalSpy = vi.spyOn(redis, 'eval');
    const rl = createRedisFixedWindowLimiter(redis, { max: 2, windowMs: 60_000, namespace: 'test' });

    // First take() on a brand-new key: gets a TTL immediately (there is no
    // observable "count=1, no TTL" state — see makeFakeRedis's doc comment).
    const first = await rl.take('u1');
    expect(first.allowed).toBe(true);
    expect(evalSpy).toHaveBeenCalledTimes(1);
    // Exactly one round trip issued for this take() — the script itself,
    // not incr-then-pexpire-then-pttl as separate calls.
    const [scriptArg, numkeysArg] = evalSpy.mock.calls[0]!;
    expect(typeof scriptArg).toBe('string');
    expect(numkeysArg).toBe(1);

    // Second take(): still allowed (max=2), same key already has a TTL.
    expect((await rl.take('u1')).allowed).toBe(true);
    // Third take(): count now exceeds max -> blocked, with a real
    // (already-set-on-first-INCR) TTL backing the retryAfterSeconds.
    const third = await rl.take('u1');
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
    expect(third.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect(evalSpy).toHaveBeenCalledTimes(3);
  });
});

describe('getFixedWindowLimiter selector', () => {
  afterEach(() => {
    getRedisMock.mockReset();
  });

  it('falls back to the in-memory limiter when REDIS_URL is unset (getRedis() -> null)', async () => {
    getRedisMock.mockReturnValue(null);
    const { getFixedWindowLimiter } = await import('./rate-limit-redis');
    const limiter = getFixedWindowLimiter({ max: 1, windowMs: 60_000, namespace: 'test' });

    expect((await limiter.take('k')).allowed).toBe(true);
    expect((await limiter.take('k')).allowed).toBe(false);
  });

  it('uses the Redis-backed limiter when getRedis() returns a client', async () => {
    const fake = makeFakeRedis();
    const evalSpy = vi.spyOn(fake, 'eval');
    getRedisMock.mockReturnValue(fake);
    const { getFixedWindowLimiter } = await import('./rate-limit-redis');
    const limiter = getFixedWindowLimiter({ max: 1, windowMs: 60_000, namespace: 'test' });

    await limiter.take('k');
    expect(evalSpy).toHaveBeenCalled();
  });
});
