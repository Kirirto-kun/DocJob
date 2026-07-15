import * as SecureStore from 'expo-secure-store';

/**
 * SecureStore key names for the three pieces of auth state we persist on
 * device. Exported (not just internal literals) so tests can assert against
 * them without duplicating the strings.
 */
export const TOKEN_KEYS = {
  access: 'docjob.accessToken',
  refresh: 'docjob.refreshToken',
  refreshExpiresAt: 'docjob.refreshExpiresAt',
} as const;

export type PersistedTokens = {
  access: string;
  refresh: string;
  /** ISO-8601 string, as returned by the login/refresh endpoints. */
  refreshExpiresAt: string;
};

export type TokenStore = {
  getAccess(): Promise<string | null>;
  getRefresh(): Promise<string | null>;
  getRefreshExpiresAt(): Promise<string | null>;
  setTokens(tokens: PersistedTokens): Promise<void>;
  clear(): Promise<void>;
};

/**
 * Minimal FIFO mutex: every operation passed to `run()` is chained onto a
 * single `tail` promise, so calls execute strictly in the order they were
 * invoked (not the order their underlying I/O happens to settle).
 *
 * This exists because the refresh token is single-use — `auth-client.ts`'s
 * `refresh()` does a read (`getRefresh()`), an HTTP rotation, then a write
 * (`setTokens()`) of the new pair. If a concurrent read or write could
 * interleave with that sequence (e.g. two `setTokens()` calls racing their
 * underlying `SecureStore.setItemAsync` writes), the on-device state could
 * end up torn — e.g. a new access token paired with a stale refresh token —
 * which would make the *next* refresh attempt present an already-rotated
 * token and trip the server's reuse-detection, revoking the whole session
 * family. Routing every `TokenStore` operation (reads included, so a read
 * can't observe a half-written state either) through this one queue makes
 * "read-rotate-write never interleaves" hold by construction.
 */
function createMutex() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(fn: () => Promise<T>): Promise<T> {
    const result = tail.then(fn, fn);
    // Chain future work off a promise that always resolves, so one failed
    // operation doesn't wedge the queue for everyone queued after it. The
    // rejection itself is still delivered to whoever awaits `result`.
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

const withLock = createMutex();

async function readKey(key: string): Promise<string | null> {
  return withLock(() => SecureStore.getItemAsync(key));
}

export const tokenStore: TokenStore = {
  getAccess(): Promise<string | null> {
    return readKey(TOKEN_KEYS.access);
  },

  getRefresh(): Promise<string | null> {
    return readKey(TOKEN_KEYS.refresh);
  },

  getRefreshExpiresAt(): Promise<string | null> {
    return readKey(TOKEN_KEYS.refreshExpiresAt);
  },

  setTokens(tokens: PersistedTokens): Promise<void> {
    return withLock(async () => {
      // Write order is deliberate, not stylistic: SecureStore has no
      // transaction, so a crash/kill between two of these writes can persist
      // a torn pair. The refresh token — the long-lived, high-value
      // credential (it's what a stolen device could use to mint new access
      // tokens indefinitely; restricted to when the device is unlocked and
      // never migrated to a new device via backup/restore) — is also
      // single-use and server-rotated on every `refresh()`. If it were
      // written LAST and a crash landed between the access write and the
      // refresh write, the device would persist a NEW access token paired
      // with the OLD (already-spent) refresh token; the next `refresh()`
      // would then present that spent token, trip the server's reuse
      // detection, and revoke the whole token family — a hard, un-self-
      // healing logout. Writing refresh (and its expiry) FIRST means the
      // only crash window is "NEW refresh + OLD access" — which self-heals:
      // the stale access token simply 401s on its next use, `authFetch`
      // refreshes with the (valid, current) new refresh token, and the
      // access token catches up. Do not reorder this without re-deriving
      // this analysis.
      await SecureStore.setItemAsync(TOKEN_KEYS.refresh, tokens.refresh, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      await SecureStore.setItemAsync(TOKEN_KEYS.refreshExpiresAt, tokens.refreshExpiresAt);
      await SecureStore.setItemAsync(TOKEN_KEYS.access, tokens.access);
    });
  },

  clear(): Promise<void> {
    return withLock(async () => {
      await SecureStore.deleteItemAsync(TOKEN_KEYS.access);
      await SecureStore.deleteItemAsync(TOKEN_KEYS.refresh);
      await SecureStore.deleteItemAsync(TOKEN_KEYS.refreshExpiresAt);
    });
  },
};
