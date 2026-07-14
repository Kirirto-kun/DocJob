/**
 * In-memory sliding-window attempt limiter, keyed by an arbitrary string
 * (login uses `ip:<ip>` and `email:<email>` keys, checked/recorded
 * independently so a single leaked/shared IP can't lock out every account
 * behind it, and vice versa).
 *
 * Behind the `AttemptLimiter` interface so SP-5 can swap this module-level
 * `Map`-backed implementation for a Redis-backed one without touching
 * `login.service.ts` — the limiter is passed in (or defaulted) as a plain
 * dependency, never imported directly by call sites that check/record.
 */
export interface AttemptLimiter {
  /** Whether `key` may attempt right now, without recording anything. */
  check(key: string): { allowed: boolean; retryAfterSeconds: number };
  /** Records the outcome of an attempt for `key`. A success clears the window. */
  record(key: string, success: boolean): void;
}

interface Entry {
  /** Timestamps (ms) of failures still inside the sliding window. */
  failures: number[];
  /** Set once `failures.length` reaches `maxAttempts`; cleared on success. */
  lockedUntil: number | null;
}

/**
 * Creates a fresh in-memory limiter. Each call owns its own `Map` — tests
 * should create their own instance (rather than sharing the module-level
 * default `login.service.ts` falls back to) so attempt counts from one test
 * can't bleed into the next.
 */
export function createInMemoryLimiter(opts?: {
  maxAttempts?: number;
  windowSeconds?: number;
  lockSeconds?: number;
}): AttemptLimiter {
  const maxAttempts = opts?.maxAttempts ?? 5;
  const windowSeconds = opts?.windowSeconds ?? 60;
  const lockSeconds = opts?.lockSeconds ?? 300;

  const store = new Map<string, Entry>();

  function pruneAndGet(key: string, now: number): Entry {
    let entry = store.get(key);
    if (!entry) {
      entry = { failures: [], lockedUntil: null };
      store.set(key, entry);
    }
    const windowStart = now - windowSeconds * 1000;
    entry.failures = entry.failures.filter((ts) => ts > windowStart);
    return entry;
  }

  return {
    check(key) {
      const now = Date.now();
      const entry = pruneAndGet(key, now);
      if (entry.lockedUntil !== null) {
        if (entry.lockedUntil > now) {
          return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.lockedUntil - now) / 1000)) };
        }
        // Lock has expired — clear it so the account/IP can try again.
        entry.lockedUntil = null;
        entry.failures = [];
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },
    record(key, success) {
      const now = Date.now();
      const entry = pruneAndGet(key, now);
      if (success) {
        entry.failures = [];
        entry.lockedUntil = null;
        return;
      }
      entry.failures.push(now);
      if (entry.failures.length >= maxAttempts) {
        entry.lockedUntil = now + lockSeconds * 1000;
      }
    },
  };
}
