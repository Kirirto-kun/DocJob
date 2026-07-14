import { NextResponse } from 'next/server';

function originFromReferer(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/**
 * The origin state-changing requests are expected to arrive from. Prefers
 * `AUTH_URL` (the source of truth in every deployed environment — set in
 * `.env`/`.env.local`, see CLAUDE.md); falls back to the request's own
 * `Host` header only when `AUTH_URL` is unset or unparsable, so ad-hoc local
 * dev (a port that doesn't match `AUTH_URL`) doesn't get needlessly locked
 * out.
 */
function allowedOrigin(req: Request): string | null {
  const authUrl = process.env.AUTH_URL;
  if (authUrl) {
    try {
      return new URL(authUrl).origin;
    } catch {
      // Unparsable AUTH_URL — fall through to the host-based fallback below.
    }
  }
  const host = req.headers.get('host');
  if (!host) return null;
  const proto = req.headers.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}

/**
 * Same-origin guard for cookie-authenticated, state-changing (POST) routes.
 * Browsers always attach an `Origin` header to cross-site POSTs (falling
 * back to `Referer` for older/edge-case clients that omit `Origin`), so a
 * request forged from another site's page — which rides on the victim's
 * cookies automatically — is rejected here before it ever reaches
 * `auth.login`/`auth.rotateRefresh`.
 *
 * Requests authenticating via a Bearer `Authorization` header (and *no*
 * cookie) are exempt: CSRF specifically exploits the browser's automatic
 * cookie attachment, and a malicious page has no way to read or attach an
 * `Authorization` header to a cross-origin request, so bearer-only callers
 * (future native/API clients) aren't vulnerable to it. This guard only
 * needs to cover today's cookie-based web login/refresh/logout routes.
 *
 * Returns a `403` `NextResponse` to short-circuit the caller when the check
 * fails, or `null` when the request should proceed.
 */
export function assertSameOrigin(req: Request): NextResponse | null {
  const authHeader = req.headers.get('authorization');
  const hasCookie = !!req.headers.get('cookie');
  if (authHeader?.toLowerCase().startsWith('bearer ') && !hasCookie) {
    return null;
  }

  const origin = req.headers.get('origin') ?? originFromReferer(req.headers.get('referer'));
  const expected = allowedOrigin(req);

  if (!origin || !expected || origin !== expected) {
    return NextResponse.json({ error: 'CSRF check failed' }, { status: 403 });
  }
  return null;
}
