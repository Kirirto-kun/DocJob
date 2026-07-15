import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { tokenStore, TOKEN_KEYS } from './token-store';

/**
 * `expo-secure-store` mocked with a plain in-memory `Map` standing in for
 * the native Keychain/Keystore. `setItemAsync` honours an injectable write
 * delay (`__testState.writeDelayMs`, toggled per-test via `setWriteDelay`
 * below) so the mutex-serialization test can prove writes never interleave,
 * not just that the final state happens to be correct.
 *
 * Everything the mock needs lives INSIDE the `jest.mock` factory — Jest's
 * babel-plugin-jest-hoist forbids referencing out-of-scope variables from a
 * mock factory (it's hoisted above all imports), so the backing store, the
 * `jest.fn()`s, and the write-delay flag are all created here and exposed on
 * the mocked module itself for the test body to reach via
 * `jest.requireMock('expo-secure-store')`. This call is written AFTER the
 * `import`s (unlike the usual jest.mock-before-import convention) purely to
 * satisfy ESLint's `import/first` — babel-plugin-jest-hoist hoists
 * `jest.mock()` calls above every import at transform time regardless of
 * source position, so this is equivalent at runtime.
 */
jest.mock('expo-secure-store', () => {
  const backingStore = new Map<string, string>();
  const testState = { writeDelayMs: 0 };

  const getItemAsync = jest.fn(async (key: string): Promise<string | null> => {
    return backingStore.has(key) ? (backingStore.get(key) as string) : null;
  });
  const setItemAsync = jest.fn(async (key: string, value: string): Promise<void> => {
    if (testState.writeDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, testState.writeDelayMs));
    }
    backingStore.set(key, value);
  });
  const deleteItemAsync = jest.fn(async (key: string): Promise<void> => {
    backingStore.delete(key);
  });

  return {
    __esModule: true,
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
    getItemAsync,
    setItemAsync,
    deleteItemAsync,
    __testState: testState,
    __backingStore: backingStore,
  };
});

type SecureStoreMock = {
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
  __testState: { writeDelayMs: number };
  __backingStore: Map<string, string>;
};

const secureStoreMock = jest.requireMock('expo-secure-store') as unknown as SecureStoreMock;

beforeEach(() => {
  secureStoreMock.__backingStore.clear();
  secureStoreMock.__testState.writeDelayMs = 0;
  secureStoreMock.getItemAsync.mockClear();
  secureStoreMock.setItemAsync.mockClear();
  secureStoreMock.deleteItemAsync.mockClear();
});

describe('tokenStore', () => {
  it('getAccess/getRefresh/getRefreshExpiresAt resolve null before anything is stored', async () => {
    await expect(tokenStore.getAccess()).resolves.toBeNull();
    await expect(tokenStore.getRefresh()).resolves.toBeNull();
    await expect(tokenStore.getRefreshExpiresAt()).resolves.toBeNull();
  });

  it('setTokens then getAccess/getRefresh/getRefreshExpiresAt round-trips the values', async () => {
    await tokenStore.setTokens({
      access: 'access-1',
      refresh: 'refresh-1',
      refreshExpiresAt: '2030-01-01T00:00:00.000Z',
    });

    await expect(tokenStore.getAccess()).resolves.toBe('access-1');
    await expect(tokenStore.getRefresh()).resolves.toBe('refresh-1');
    await expect(tokenStore.getRefreshExpiresAt()).resolves.toBe('2030-01-01T00:00:00.000Z');
  });

  it('persists the refresh token with keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY', async () => {
    await tokenStore.setTokens({
      access: 'access-1',
      refresh: 'refresh-1',
      refreshExpiresAt: '2030-01-01T00:00:00.000Z',
    });

    const refreshCall = secureStoreMock.setItemAsync.mock.calls.find(
      (call) => call[0] === TOKEN_KEYS.refresh,
    );
    expect(refreshCall?.[2]).toEqual({ keychainAccessible: 1 });
  });

  it('clear() empties all three keys', async () => {
    await tokenStore.setTokens({
      access: 'access-1',
      refresh: 'refresh-1',
      refreshExpiresAt: '2030-01-01T00:00:00.000Z',
    });

    await tokenStore.clear();

    await expect(tokenStore.getAccess()).resolves.toBeNull();
    await expect(tokenStore.getRefresh()).resolves.toBeNull();
    await expect(tokenStore.getRefreshExpiresAt()).resolves.toBeNull();
  });

  it('serializes concurrent setTokens calls through the mutex — writes never interleave', async () => {
    // Slow down each individual SecureStore write so two concurrent
    // setTokens() calls would visibly interleave (e.g. access-1 paired with
    // refresh-2) if the mutex weren't serializing them.
    secureStoreMock.__testState.writeDelayMs = 10;

    const first = tokenStore.setTokens({
      access: 'access-1',
      refresh: 'refresh-1',
      refreshExpiresAt: 'exp-1',
    });
    const second = tokenStore.setTokens({
      access: 'access-2',
      refresh: 'refresh-2',
      refreshExpiresAt: 'exp-2',
    });

    await Promise.all([first, second]);

    // The mutex serializes calls in invocation order: the second call's
    // writes only begin once the first call's writes have fully finished, so
    // the final state must be entirely from the second call — never a mix.
    await expect(tokenStore.getAccess()).resolves.toBe('access-2');
    await expect(tokenStore.getRefresh()).resolves.toBe('refresh-2');
    await expect(tokenStore.getRefreshExpiresAt()).resolves.toBe('exp-2');

    // All 3 keys were written for call 1 (in order) before call 2's first
    // write started at all — proves no interleaving, not just a correct
    // final value.
    const calls = secureStoreMock.setItemAsync.mock.calls as [string, string, unknown][];
    const call1Keys = calls.slice(0, 3).map(([key, value]) => `${key}=${value}`);
    const call2Keys = calls.slice(3, 6).map(([key, value]) => `${key}=${value}`);
    expect(call1Keys).toEqual([
      `${TOKEN_KEYS.access}=access-1`,
      `${TOKEN_KEYS.refresh}=refresh-1`,
      `${TOKEN_KEYS.refreshExpiresAt}=exp-1`,
    ]);
    expect(call2Keys).toEqual([
      `${TOKEN_KEYS.access}=access-2`,
      `${TOKEN_KEYS.refresh}=refresh-2`,
      `${TOKEN_KEYS.refreshExpiresAt}=exp-2`,
    ]);
  });

  it('a get() issued while a setTokens() is in flight is serialized after it (no torn read)', async () => {
    secureStoreMock.__testState.writeDelayMs = 10;

    await tokenStore.setTokens({
      access: 'access-1',
      refresh: 'refresh-1',
      refreshExpiresAt: 'exp-1',
    });

    const setPromise = tokenStore.setTokens({
      access: 'access-2',
      refresh: 'refresh-2',
      refreshExpiresAt: 'exp-2',
    });
    const readPromise = tokenStore.getAccess();

    const [, readValue] = await Promise.all([setPromise, readPromise]);

    // Because reads are queued on the same mutex, a getAccess() issued right
    // after setTokens() (before it settles) is guaranteed to observe the
    // fully-written new value, never a half-written intermediate state.
    expect(readValue).toBe('access-2');
  });
});
