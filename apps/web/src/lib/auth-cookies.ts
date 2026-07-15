import type { NextResponse } from 'next/server';

/**
 * The minimal cookie-jar shape `getAccessToken`/`getRefreshToken` need to
 * read a cookie by name. Both `NextRequest['cookies']` (route handlers,
 * middleware) and the `ReadonlyRequestCookies` returned by `next/headers`'s
 * `cookies()` (Server Components/Actions — see `@/lib/session.ts`) satisfy
 * this shape, so the same two helpers work from either call site.
 */
type CookieJar = { get(name: string): { value: string } | undefined };

/** Access-token cookie lifetime: matches the JWT's own ~15m TTL (see packages/auth/src/tokens.ts's DEFAULT_TTL_SECONDS). */
const ACCESS_COOKIE_MAX_AGE_SECONDS = 15 * 60;

/**
 * Whether the app is being served over https. Drives both the cookies'
 * `Secure` attribute and, per RFC 6265bis, whether the `__Host-`/`__Secure-`
 * name prefixes may legally be used — browsers reject those prefixes on a
 * cookie that isn't `Secure`, so in local http dev we fall back to plain
 * names entirely rather than set a cookie the browser silently drops.
 */
function isSecureDeployment(): boolean {
  return (process.env.AUTH_URL ?? '').startsWith('https://');
}

const ACCESS_COOKIE_NAME_PLAIN = 'docjob-access';
const ACCESS_COOKIE_NAME_SECURE = '__Host-docjob-access';

/**
 * Both access-cookie name variants this app has ever set, regardless of the
 * current deployment's https-ness. Exported so request-driven token
 * extraction from a raw `Request`'s `cookie` header (`@/lib/session`'s
 * `getUserFromRequest`, mirroring `packages/api/src/context.ts`'s
 * `cookieToken`) can recognize either variant without re-hardcoding these
 * literal names a third time. `packages/api/src/context.ts` has to keep its
 * own literal copy of this same pair — it can't import this file, since this
 * module can't be imported by the transport-agnostic `@docjob/api` package
 * (see that file's comment) — but every call site *within* `apps/web` should
 * import from here instead.
 */
export const ACCESS_COOKIE_NAMES = [ACCESS_COOKIE_NAME_PLAIN, ACCESS_COOKIE_NAME_SECURE] as const;

/**
 * `__Host-` requires Secure + Path=/ + no Domain attribute — exactly what
 * the access cookie already is, so it gets the strongest available prefix.
 * The refresh cookie is scoped to `path: '/api/auth'` (not `/'`), which
 * disqualifies it from `__Host-` (the prefix's spec mandates Path=/), so it
 * only gets `__Secure-` (Secure attribute only, no path constraint).
 */
function accessCookieName(): string {
  return isSecureDeployment() ? ACCESS_COOKIE_NAME_SECURE : ACCESS_COOKIE_NAME_PLAIN;
}

function refreshCookieName(): string {
  return isSecureDeployment() ? '__Secure-docjob-refresh' : 'docjob-refresh';
}

export type AuthTokens = {
  access: string;
  refresh: string;
  refreshExpiresAt: Date;
};

/**
 * Sets the httpOnly access + refresh cookies on a response. Never exposes
 * either token to client-side JS (`httpOnly: true`) — the browser attaches
 * them automatically on subsequent same-site requests.
 */
export function setAuthCookies(res: NextResponse, tokens: AuthTokens): void {
  const secure = isSecureDeployment();

  res.cookies.set(accessCookieName(), tokens.access, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_COOKIE_MAX_AGE_SECONDS,
  });

  const refreshMaxAge = Math.max(
    0,
    Math.floor((tokens.refreshExpiresAt.getTime() - Date.now()) / 1000),
  );
  res.cookies.set(refreshCookieName(), tokens.refresh, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: refreshMaxAge,
  });
}

/** Clears both auth cookies (logout, or a refresh/verify failure that should force re-login). */
export function clearAuthCookies(res: NextResponse): void {
  const secure = isSecureDeployment();

  res.cookies.set(accessCookieName(), '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  res.cookies.set(refreshCookieName(), '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 0,
  });
}

/** Reads the access-token cookie out of any `CookieJar` (request or `next/headers` store), if present. */
export function getAccessToken(cookies: CookieJar): string | undefined {
  return cookies.get(accessCookieName())?.value;
}

/** Reads the refresh-token cookie out of any `CookieJar` (request or `next/headers` store), if present. */
export function getRefreshToken(cookies: CookieJar): string | undefined {
  return cookies.get(refreshCookieName())?.value;
}
