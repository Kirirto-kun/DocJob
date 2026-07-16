import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { SessionProvider, useSession } from './session';
import * as authClient from '../lib/auth-client';
import type { SerializedUser } from '../lib/api-types';

/**
 * `../lib/auth-client` is mocked wholesale (T2's `fetchMe`/`login`/`logout`
 * are separately covered by `auth-client.test.ts`) so these tests isolate
 * `session.tsx`'s own status-derivation + idempotent-onLogout logic. The
 * `onLogout` mock keeps a real listener registry (mirrors the actual
 * module's `Set`-backed pub/sub) and exposes `__emitLogout` so tests can
 * simulate a forced-logout signal from `authFetch` without needing a real
 * 401/refresh-failure round trip. Written after the `import`s (per this
 * repo's convention, see auth-client.test.ts) purely to satisfy ESLint's
 * `import/first` — babel-plugin-jest-hoist hoists `jest.mock()` above every
 * import at transform time regardless of source position.
 */
jest.mock('../lib/auth-client', () => {
  const listeners = new Set<() => void>();
  return {
    __esModule: true,
    fetchMe: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
    onLogout: jest.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    __emitLogout: () => {
      for (const listener of listeners) listener();
    },
  };
});

type MockedAuthClient = {
  fetchMe: jest.MockedFunction<typeof authClient.fetchMe>;
  login: jest.MockedFunction<typeof authClient.login>;
  logout: jest.MockedFunction<typeof authClient.logout>;
  onLogout: jest.MockedFunction<typeof authClient.onLogout>;
  __emitLogout: () => void;
};

const mockedAuthClient = authClient as unknown as MockedAuthClient;

// Loose fixtures — only the fields `session.tsx` actually reads (`approvedAt`
// for status derivation) are given real values; cast past the rest of
// `SerializedUser`'s many optional profile fields, which aren't relevant to
// these tests.
const approvedUser = {
  id: 'u1',
  approvedAt: '2024-01-01T00:00:00.000Z',
} as unknown as SerializedUser;
const pendingUser = {
  id: 'u2',
  approvedAt: null,
} as unknown as SerializedUser;

beforeEach(() => {
  mockedAuthClient.fetchMe.mockReset();
  mockedAuthClient.login.mockReset();
  mockedAuthClient.logout.mockReset();
  mockedAuthClient.onLogout.mockClear();
});

describe('SessionProvider / useSession', () => {
  it('exposes "loading" synchronously until fetchMe resolves, then "authenticated" for an approved user', async () => {
    let resolveFetchMe!: (user: SerializedUser | null) => void;
    mockedAuthClient.fetchMe.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetchMe = resolve;
        }),
    );

    const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });
    expect(result.current.status).toBe('loading');

    await act(async () => {
      resolveFetchMe(approvedUser);
    });

    expect(result.current.status).toBe('authenticated');
    expect(result.current.user).toEqual(approvedUser);
  });

  it('moves to "unauthenticated" when fetchMe resolves null', async () => {
    mockedAuthClient.fetchMe.mockResolvedValue(null);

    const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });

    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    expect(result.current.user).toBeNull();
  });

  it('treats a user with approvedAt: null as "pending"', async () => {
    mockedAuthClient.fetchMe.mockResolvedValue(pendingUser);

    const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });

    await waitFor(() => expect(result.current.status).toBe('pending'));
    expect(result.current.user).toEqual(pendingUser);
  });

  it('clears to "unauthenticated" when onLogout fires, and firing it a second time is a safe no-op', async () => {
    mockedAuthClient.fetchMe.mockResolvedValue(approvedUser);

    const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    await act(async () => {
      mockedAuthClient.__emitLogout();
    });
    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.user).toBeNull();

    // A second (or third) onLogout signal — as happens when several
    // concurrent requests in one batch each hit a failed refresh — must not
    // throw and must not change the already-settled state.
    await expect(
      act(async () => {
        mockedAuthClient.__emitLogout();
        mockedAuthClient.__emitLogout();
      }),
    ).resolves.not.toThrow();
    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.user).toBeNull();
  });

  it('login() delegates to auth-client.login and, on success, re-fetches "me" to update status', async () => {
    mockedAuthClient.fetchMe
      .mockResolvedValueOnce(null) // initial mount
      .mockResolvedValueOnce(approvedUser); // post-login refetch
    mockedAuthClient.login.mockResolvedValue({ status: 'ok', user: approvedUser });

    const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));

    let loginResult: unknown;
    await act(async () => {
      loginResult = await result.current.login('doc@example.com', 'secret', 'iPhone');
    });

    expect(mockedAuthClient.login).toHaveBeenCalledWith('doc@example.com', 'secret', 'iPhone');
    expect(loginResult).toEqual({ status: 'ok', user: approvedUser });
    expect(result.current.status).toBe('authenticated');
    expect(result.current.user).toEqual(approvedUser);
  });

  it('login() surfaces a "pending" result without touching session status', async () => {
    mockedAuthClient.fetchMe.mockResolvedValue(null);
    mockedAuthClient.login.mockResolvedValue({ status: 'pending' });

    const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));

    let loginResult: unknown;
    await act(async () => {
      loginResult = await result.current.login('doc@example.com', 'secret');
    });

    expect(loginResult).toEqual({ status: 'pending' });
    expect(result.current.status).toBe('unauthenticated');
    // A failed login (pending/invalid/locked) never issues tokens, so no
    // refetch should have been attempted beyond the initial mount fetch.
    expect(mockedAuthClient.fetchMe).toHaveBeenCalledTimes(1);
  });

  it('login() surfaces "invalid" and "locked" results the same way', async () => {
    mockedAuthClient.fetchMe.mockResolvedValue(null);
    const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));

    mockedAuthClient.login.mockResolvedValueOnce({ status: 'invalid' });
    let invalidResult: unknown;
    await act(async () => {
      invalidResult = await result.current.login('doc@example.com', 'wrong');
    });
    expect(invalidResult).toEqual({ status: 'invalid' });

    mockedAuthClient.login.mockResolvedValueOnce({ status: 'locked', retryAfterSeconds: 42 });
    let lockedResult: unknown;
    await act(async () => {
      lockedResult = await result.current.login('doc@example.com', 'wrong');
    });
    expect(lockedResult).toEqual({ status: 'locked', retryAfterSeconds: 42 });
    expect(result.current.status).toBe('unauthenticated');
  });

  it('logout() calls auth-client.logout and clears the session', async () => {
    mockedAuthClient.fetchMe.mockResolvedValue(approvedUser);
    mockedAuthClient.logout.mockResolvedValue(undefined);

    const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    await act(async () => {
      await result.current.logout();
    });

    expect(mockedAuthClient.logout).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.user).toBeNull();
  });

  it('refetch() re-runs fetchMe and updates status', async () => {
    mockedAuthClient.fetchMe.mockResolvedValueOnce(null).mockResolvedValueOnce(approvedUser);

    const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.status).toBe('authenticated');
    expect(mockedAuthClient.fetchMe).toHaveBeenCalledTimes(2);
  });

  it('throws when useSession is called outside a SessionProvider', async () => {
    const { result } = await renderHook(() => {
      try {
        return useSession();
      } catch (e) {
        return e;
      }
    });
    expect(result.current).toBeInstanceOf(Error);
  });
});
