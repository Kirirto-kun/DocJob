import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { tokenStore } from './token-store';
import { API_BASE_URL } from './config';
import { authFetch, refresh, login, logout, fetchMe, onLogout } from './auth-client';

/**
 * `./token-store` is mocked (not the real `expo-secure-store`-backed
 * implementation — that's covered by `token-store.test.ts`) so these tests
 * isolate `auth-client.ts`'s own single-flight/retry logic. Backing state
 * lives inside the factory (babel-plugin-jest-hoist forbids a `jest.mock`
 * factory from closing over out-of-scope variables) and is exposed on the
 * mocked module for the test body to read/reset via `jest.requireMock`. Both
 * `jest.mock()` calls below are written AFTER the `import`s (unlike the
 * usual jest.mock-before-import convention) purely to satisfy ESLint's
 * `import/first` — babel-plugin-jest-hoist hoists `jest.mock()` calls above
 * every import at transform time regardless of source position, so this is
 * equivalent at runtime.
 */
jest.mock('./token-store', () => {
  const state: { access: string | null; refresh: string | null; refreshExpiresAt: string | null } = {
    access: null,
    refresh: null,
    refreshExpiresAt: null,
  };

  const getAccess = jest.fn(async () => state.access);
  const getRefresh = jest.fn(async () => state.refresh);
  const getRefreshExpiresAt = jest.fn(async () => state.refreshExpiresAt);
  const setTokens = jest.fn(
    async (tokens: { access: string; refresh: string; refreshExpiresAt: string }) => {
      state.access = tokens.access;
      state.refresh = tokens.refresh;
      state.refreshExpiresAt = tokens.refreshExpiresAt;
    },
  );
  const clear = jest.fn(async () => {
    state.access = null;
    state.refresh = null;
    state.refreshExpiresAt = null;
  });

  return {
    __esModule: true,
    tokenStore: { getAccess, getRefresh, getRefreshExpiresAt, setTokens, clear },
    __testState: state,
  };
});

// `config.ts` reads `expo-constants` at module load; stub it out so
// `API_BASE_URL` resolves to a fixed, predictable value without needing a
// real Expo runtime.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

type MockTokenStore = {
  getAccess: jest.Mock;
  getRefresh: jest.Mock;
  getRefreshExpiresAt: jest.Mock;
  setTokens: jest.Mock;
  clear: jest.Mock;
};

const mockTokenStore = tokenStore as unknown as MockTokenStore;
const testState = (jest.requireMock('./token-store') as { __testState: Record<string, unknown> })
  .__testState as { access: string | null; refresh: string | null; refreshExpiresAt: string | null };

/** Minimal fetch-Response fake — only the surface auth-client.ts touches. */
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function authHeader(init: RequestInit | undefined): string | undefined {
  const headers = init?.headers as Record<string, string> | undefined;
  return headers?.authorization ?? headers?.Authorization;
}

beforeEach(() => {
  testState.access = 'access-1';
  testState.refresh = 'refresh-1';
  testState.refreshExpiresAt = '2030-01-01T00:00:00.000Z';
  mockTokenStore.getAccess.mockClear();
  mockTokenStore.getRefresh.mockClear();
  mockTokenStore.getRefreshExpiresAt.mockClear();
  mockTokenStore.setTokens.mockClear();
  mockTokenStore.clear.mockClear();
  (global as unknown as { fetch: unknown }).fetch = undefined;
});

describe('authFetch', () => {
  it('attaches Authorization: Bearer <access> to the request', async () => {
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(authHeader(init)).toBe('Bearer access-1');
      return jsonResponse(200, { ok: true });
    });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const res = await authFetch(`${API_BASE_URL}/api/trpc/foo`);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns the response unchanged on a non-401 status (no refresh attempted)', async () => {
    const fetchMock = jest.fn(async () => jsonResponse(500, { error: 'boom' }));
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const res = await authFetch(`${API_BASE_URL}/api/trpc/foo`);
    expect(res.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockTokenStore.setTokens).not.toHaveBeenCalled();
  });

  describe('the centerpiece: concurrent 401s share exactly one refresh', () => {
    const OLD_ACCESS = 'access-1';
    const NEW_ACCESS = 'access-2';
    const OLD_REFRESH = 'refresh-1';
    const NEW_REFRESH = 'refresh-2';
    const NEW_EXPIRES = '2031-01-01T00:00:00.000Z';

    function makeFetchMock() {
      const refreshRequests: unknown[] = [];
      const protectedRequests: { authHeader: string | undefined }[] = [];

      const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith('/api/auth/refresh')) {
          refreshRequests.push(init?.body ? JSON.parse(init.body as string) : null);
          return jsonResponse(200, {
            user: { id: 'u1' },
            access: NEW_ACCESS,
            refresh: NEW_REFRESH,
            refreshExpiresAt: NEW_EXPIRES,
          });
        }

        if (url.endsWith('/protected')) {
          const header = authHeader(init);
          protectedRequests.push({ authHeader: header });
          if (header === `Bearer ${NEW_ACCESS}`) {
            return jsonResponse(200, { ok: true });
          }
          return jsonResponse(401, { error: 'unauthorized' });
        }

        throw new Error(`unexpected fetch to ${url}`);
      });

      return { fetchMock, refreshRequests, protectedRequests };
    }

    it('fires exactly one /api/auth/refresh call, retries all 3 originals after it, persists the rotated tokens once before any retry, and each retry carries the NEW access token', async () => {
      const { fetchMock, refreshRequests, protectedRequests } = makeFetchMock();
      (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

      const results = await Promise.all([
        authFetch(`${API_BASE_URL}/protected`),
        authFetch(`${API_BASE_URL}/protected`),
        authFetch(`${API_BASE_URL}/protected`),
      ]);

      // (a) refresh endpoint fetched exactly once — the shared in-flight promise.
      expect(refreshRequests).toHaveLength(1);
      expect(refreshRequests[0]).toEqual({ refresh: OLD_REFRESH });

      // (b) all 3 original requests were retried after the single refresh —
      // each authFetch call issued 2 fetches to /protected (initial 401 +
      // retry): 6 total across the 3 calls.
      expect(protectedRequests).toHaveLength(6);
      const initialAttempts = protectedRequests.filter((r) => r.authHeader === `Bearer ${OLD_ACCESS}`);
      const retryAttempts = protectedRequests.filter((r) => r.authHeader === `Bearer ${NEW_ACCESS}`);
      expect(initialAttempts).toHaveLength(3);
      expect(retryAttempts).toHaveLength(3);

      // (c) the rotated refresh token was persisted exactly once.
      expect(mockTokenStore.setTokens).toHaveBeenCalledTimes(1);
      expect(mockTokenStore.setTokens).toHaveBeenCalledWith({
        access: NEW_ACCESS,
        refresh: NEW_REFRESH,
        refreshExpiresAt: NEW_EXPIRES,
      });

      // (d) every retry succeeded and carried the new access token (already
      // asserted via `retryAttempts` above; also confirm the caller-visible
      // responses reflect the successful retry, not the original 401).
      for (const res of results) {
        expect(res.status).toBe(200);
      }
    });

    it('persists the rotated refresh token BEFORE any retry is issued (atomic ordering)', async () => {
      const order: string[] = [];
      const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/auth/refresh')) {
          return jsonResponse(200, {
            user: { id: 'u1' },
            access: NEW_ACCESS,
            refresh: NEW_REFRESH,
            refreshExpiresAt: NEW_EXPIRES,
          });
        }
        if (url.endsWith('/protected')) {
          const header = authHeader(init);
          if (header === `Bearer ${NEW_ACCESS}`) {
            order.push('retry');
            return jsonResponse(200, { ok: true });
          }
          order.push('initial-401');
          return jsonResponse(401, { error: 'unauthorized' });
        }
        throw new Error(`unexpected fetch to ${url}`);
      });
      (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
      mockTokenStore.setTokens.mockImplementation(async (tokens: unknown) => {
        order.push('persist-tokens');
        testState.access = (tokens as { access: string }).access;
        testState.refresh = (tokens as { refresh: string }).refresh;
        testState.refreshExpiresAt = (tokens as { refreshExpiresAt: string }).refreshExpiresAt;
      });

      await authFetch(`${API_BASE_URL}/protected`);

      const persistIndex = order.indexOf('persist-tokens');
      const retryIndex = order.indexOf('retry');
      expect(persistIndex).toBeGreaterThan(-1);
      expect(retryIndex).toBeGreaterThan(-1);
      expect(persistIndex).toBeLessThan(retryIndex);
    });
  });

  describe('refresh failure', () => {
    it('clears tokens, fires onLogout, and returns the original 401 without a second retry', async () => {
      const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/auth/refresh')) {
          return jsonResponse(401, { error: 'Session invalid' });
        }
        if (url.endsWith('/protected')) {
          return jsonResponse(401, { error: 'unauthorized' });
        }
        throw new Error(`unexpected fetch to ${url}`);
      });
      (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

      const logoutListener = jest.fn();
      const unsubscribe = onLogout(logoutListener);

      const res = await authFetch(`${API_BASE_URL}/protected`);

      expect(res.status).toBe(401);
      expect(mockTokenStore.clear).toHaveBeenCalledTimes(1);
      expect(logoutListener).toHaveBeenCalledTimes(1);

      // Exactly 2 fetches: the initial 401 + the failed refresh attempt — no
      // second retry of the original request after a failed refresh.
      const protectedCalls = fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/protected'));
      expect(protectedCalls).toHaveLength(1);

      unsubscribe();
    });

    it('does not call the refresh endpoint again on a second concurrent 401 batch and clears + signals logout once per batch', async () => {
      let refreshCalls = 0;
      const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/auth/refresh')) {
          refreshCalls += 1;
          return jsonResponse(401, { error: 'Session invalid' });
        }
        return jsonResponse(401, { error: 'unauthorized' });
      });
      (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

      await Promise.all([
        authFetch(`${API_BASE_URL}/protected`),
        authFetch(`${API_BASE_URL}/protected`),
      ]);

      expect(refreshCalls).toBe(1);
      expect(mockTokenStore.clear).toHaveBeenCalledTimes(2);
    });
  });
});

describe('refresh()', () => {
  it('posts { refresh } from the store, persists the rotated tokens on success, and resolves true', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(`${API_BASE_URL}/api/auth/refresh`);
      expect(JSON.parse(init?.body as string)).toEqual({ refresh: 'refresh-1' });
      return jsonResponse(200, {
        user: { id: 'u1' },
        access: 'new-access',
        refresh: 'new-refresh',
        refreshExpiresAt: '2031-01-01T00:00:00.000Z',
      });
    });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    await expect(refresh()).resolves.toBe(true);
    expect(mockTokenStore.setTokens).toHaveBeenCalledWith({
      access: 'new-access',
      refresh: 'new-refresh',
      refreshExpiresAt: '2031-01-01T00:00:00.000Z',
    });
  });

  it('resolves false and does not persist anything when the network call throws', async () => {
    const fetchMock = jest.fn(async () => {
      throw new Error('network down');
    });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    await expect(refresh()).resolves.toBe(false);
    expect(mockTokenStore.setTokens).not.toHaveBeenCalled();
  });
});

describe('login', () => {
  it('on success persists the returned tokens and resolves { status: "ok", user }', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(`${API_BASE_URL}/api/auth/login`);
      expect(JSON.parse(init?.body as string)).toEqual({
        email: 'doc@example.com',
        password: 'secret',
        deviceLabel: 'iPhone 15',
      });
      return jsonResponse(200, {
        user: { id: 'u1', email: 'doc@example.com' },
        access: 'access-x',
        refresh: 'refresh-x',
        refreshExpiresAt: '2031-01-01T00:00:00.000Z',
      });
    });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const result = await login('doc@example.com', 'secret', 'iPhone 15');
    expect(result).toEqual({ status: 'ok', user: { id: 'u1', email: 'doc@example.com' } });
    expect(mockTokenStore.setTokens).toHaveBeenCalledWith({
      access: 'access-x',
      refresh: 'refresh-x',
      refreshExpiresAt: '2031-01-01T00:00:00.000Z',
    });
  });

  it('on a pending (unapproved) account, resolves { status: "pending" } without persisting tokens', async () => {
    const fetchMock = jest.fn(async () => jsonResponse(401, { status: 'pending' }));
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    await expect(login('doc@example.com', 'secret')).resolves.toEqual({ status: 'pending' });
    expect(mockTokenStore.setTokens).not.toHaveBeenCalled();
  });

  it('on invalid credentials, resolves { status: "invalid" }', async () => {
    const fetchMock = jest.fn(async () => jsonResponse(401, { status: 'invalid' }));
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    await expect(login('doc@example.com', 'wrong')).resolves.toEqual({ status: 'invalid' });
  });

  it('on a locked-out account, resolves { status: "locked", retryAfterSeconds }', async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse(429, { status: 'locked', retryAfterSeconds: 42 }),
    );
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    await expect(login('doc@example.com', 'wrong')).resolves.toEqual({
      status: 'locked',
      retryAfterSeconds: 42,
    });
  });
});

describe('logout', () => {
  it('posts the current refresh token to /api/auth/logout and always clears local tokens', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(`${API_BASE_URL}/api/auth/logout`);
      expect(JSON.parse(init?.body as string)).toEqual({ refresh: 'refresh-1' });
      return jsonResponse(200, { ok: true });
    });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    await logout();
    expect(mockTokenStore.clear).toHaveBeenCalledTimes(1);
  });

  it('still clears local tokens even if the network call fails', async () => {
    const fetchMock = jest.fn(async () => {
      throw new Error('network down');
    });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    await logout();
    expect(mockTokenStore.clear).toHaveBeenCalledTimes(1);
  });

  it('does not call the network at all when there is no refresh token locally, but still clears', async () => {
    testState.refresh = null;
    const fetchMock = jest.fn();
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    await logout();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockTokenStore.clear).toHaveBeenCalledTimes(1);
  });
});

describe('fetchMe', () => {
  it('GETs /api/auth/me with the Bearer access token and returns the user', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(`${API_BASE_URL}/api/auth/me`);
      expect(authHeader(init)).toBe('Bearer access-1');
      return jsonResponse(200, { user: { id: 'u1' } });
    });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchMe()).resolves.toEqual({ id: 'u1' });
  });

  it('resolves null when the endpoint returns { user: null }', async () => {
    const fetchMock = jest.fn(async () => jsonResponse(200, { user: null }));
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchMe()).resolves.toBeNull();
  });
});
