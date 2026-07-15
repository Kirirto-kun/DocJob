import { API_BASE_URL } from './config';
import { tokenStore } from './token-store';
import type { SerializedUser } from './api-types';

/**
 * Mobile client for `apps/web/src/app/api/auth/*` (SP-4a T5's mobile
 * transport: `POST /api/auth/login|refresh|logout` return raw tokens in the
 * JSON body when the request carries no `Origin` header, which React
 * Native's `fetch` never sets — see that route's own doc comments). No
 * cookie jar is used at all: this client is Bearer-token-only, persisting
 * `{access,refresh,refreshExpiresAt}` via `./token-store` (SecureStore).
 *
 * `authFetch` mirrors `apps/web/src/lib/auth-client.ts`'s single-flight
 * 401 → refresh → retry algorithm EXACTLY (same shared `refreshInFlight`
 * promise, same "resolve `res.ok`, `.catch(()=>false)`, `.finally` clears
 * the flight" shape) — read that file before touching this one. The reason
 * single-flight matters is identical to the web version: the refresh token
 * is single-use with family reuse-detection (`@docjob/auth`), so if two
 * concurrent 401s each independently POSTed `/api/auth/refresh`, only the
 * first rotation would succeed — the second would present an
 * already-rotated (spent) token, trip reuse detection, and revoke the whole
 * session family, forcing a real logout. Sharing one in-flight promise
 * means every concurrent caller awaits the SAME rotation instead.
 */

type TokenResponseBody = {
  access: string;
  refresh: string;
  refreshExpiresAt: string;
};

function toHeaderRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  // Duck-type a `Headers`-like instance (has `.entries()`) rather than
  // requiring the global `Headers` constructor to exist — keeps this file
  // usable in a plain Jest environment without a DOM/RN fetch polyfill.
  const maybeHeadersInstance = headers as { entries?: () => IterableIterator<[string, string]> };
  if (typeof maybeHeadersInstance.entries === 'function') {
    return Object.fromEntries(maybeHeadersInstance.entries());
  }
  return { ...(headers as Record<string, string>) };
}

async function withAuthHeader(init?: RequestInit): Promise<RequestInit> {
  const access = await tokenStore.getAccess();
  const headers = toHeaderRecord(init?.headers);
  if (access) headers.authorization = `Bearer ${access}`;
  return { ...init, headers };
}

// --- onLogout subscription -------------------------------------------------

type LogoutListener = () => void;
const logoutListeners = new Set<LogoutListener>();

/**
 * Subscribe to "the session was forcibly ended" (refresh failed — expired,
 * revoked, or reused refresh token). Returns an unsubscribe function. T3's
 * session provider uses this to react (clear in-memory user state, bounce to
 * the auth stack) without `auth-client.ts` needing to know anything about
 * React/navigation.
 */
export function onLogout(listener: LogoutListener): () => void {
  logoutListeners.add(listener);
  return () => logoutListeners.delete(listener);
}

function emitLogout(): void {
  for (const listener of logoutListeners) listener();
}

// --- single-flight refresh --------------------------------------------------

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Rotates the refresh token. Posts `{ refresh: await tokenStore.getRefresh() }`
 * to `/api/auth/refresh`; on a `2xx` response, persists the rotated
 * `{access,refresh,refreshExpiresAt}` from the body via `tokenStore.setTokens`
 * BEFORE resolving — so any caller awaiting this promise is guaranteed the
 * new access token is already on disk (and readable) by the time it retries.
 * Resolves `res.ok`; any thrown error (network failure, bad JSON, ...)
 * resolves `false` rather than rejecting, so callers never need a `catch`.
 */
export function refresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshToken = await tokenStore.getRefresh();
      const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh: refreshToken }),
      });
      if (res.ok) {
        // Destructure rather than passing the parsed body straight through —
        // the response also carries a `user` field the token store has no
        // business persisting (and the centerpiece test asserts `setTokens`
        // is called with exactly the 3-field token shape).
        const { access, refresh: newRefresh, refreshExpiresAt } = (await res.json()) as TokenResponseBody;
        await tokenStore.setTokens({ access, refresh: newRefresh, refreshExpiresAt });
      }
      return res.ok;
    })()
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/**
 * Drop-in replacement for `fetch` for calls to our own Bearer-authenticated
 * `/api/*` routes (REST auth endpoints directly, and the tRPC batch link via
 * `trpc.ts`). Attaches `Authorization: Bearer <access>`; on a `401` it
 * awaits the single shared `refresh()` and retries the ORIGINAL request
 * exactly once with the freshly rotated access token. If the refresh itself
 * fails, local tokens are cleared, `onLogout` listeners fire, and the
 * original (still-401) response is returned — no second retry.
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const first = await fetch(input, await withAuthHeader(init));
  if (first.status !== 401) return first;

  const refreshed = await refresh();
  if (!refreshed) {
    await tokenStore.clear();
    emitLogout();
    return first;
  }

  return fetch(input, await withAuthHeader(init));
}

// --- login / logout / me ----------------------------------------------------

export type LoginResult =
  | { status: 'ok'; user: SerializedUser }
  | { status: 'pending' }
  | { status: 'invalid' }
  | { status: 'locked'; retryAfterSeconds: number }
  | { status: 'error' };

/**
 * `POST /api/auth/login`. On success, persists the returned token pair and
 * resolves `{ status: 'ok', user }`. Mirrors the route's own `result.status`
 * discriminant (`pending` = correct credentials but not yet admin-approved;
 * `invalid` = unknown email or wrong password, deliberately indistinguishable
 * from `pending`; `locked` = rate-limited) for callers that want to show a
 * specific message; `error` covers a network failure or unparsable body.
 */
export async function login(
  email: string,
  password: string,
  deviceLabel?: string,
): Promise<LoginResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, deviceLabel }),
    });
  } catch {
    return { status: 'error' };
  }

  let body: Record<string, unknown>;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    return { status: 'error' };
  }

  if (res.ok) {
    const { user, access, refresh: refreshToken, refreshExpiresAt } = body as {
      user: SerializedUser;
      access: string;
      refresh: string;
      refreshExpiresAt: string;
    };
    await tokenStore.setTokens({ access, refresh: refreshToken, refreshExpiresAt });
    return { status: 'ok', user };
  }

  if (body.status === 'pending') return { status: 'pending' };
  if (body.status === 'locked') {
    return { status: 'locked', retryAfterSeconds: Number(body.retryAfterSeconds) || 0 };
  }
  return { status: 'invalid' };
}

/**
 * `POST /api/auth/logout` with the current refresh token (revokes its
 * family server-side), then unconditionally clears local tokens — even if
 * the network call fails, a logged-out device should never keep holding
 * tokens it believes are still valid. Skips the network call entirely (but
 * still clears) when there is no refresh token locally to present.
 */
export async function logout(): Promise<void> {
  const refreshToken = await tokenStore.getRefresh();
  try {
    if (refreshToken) {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh: refreshToken }),
      });
    }
  } catch {
    // Best-effort server-side revocation — local tokens are cleared in
    // `finally` regardless of whether this network call succeeded.
  } finally {
    await tokenStore.clear();
  }
}

/**
 * `GET /api/auth/me` via `authFetch` (so an expired access token
 * transparently refreshes-and-retries rather than always returning `null`).
 */
export async function fetchMe(): Promise<SerializedUser | null> {
  const res = await authFetch(`${API_BASE_URL}/api/auth/me`);
  if (!res.ok) return null;
  const body = (await res.json()) as { user: SerializedUser | null };
  return body.user;
}
