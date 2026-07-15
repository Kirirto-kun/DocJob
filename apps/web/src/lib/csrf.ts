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
 * Same-origin guard for state-changing (POST) auth routes.
 * Browsers always attach an `Origin` header to cross-site POSTs (falling
 * back to `Referer` for older/edge-case clients that omit `Origin`), so a
 * request forged from another site's page — which rides on the victim's
 * cookies automatically, or which mints a *new* session the victim's
 * browser will then hold (login CSRF) — is rejected here before it ever
 * reaches `auth.login`/`auth.rotateRefresh`.
 *
 * The exemption is keyed on Origin/Referer **presence**, not on whether the
 * request happens to carry a `cookie` header. That distinction matters
 * because CSRF isn't only "ride an existing session's ambient cookie" — it
 * also covers *session creation*: `/api/auth/login` mints a session with no
 * ambient credential at all, so a cookie-based exemption would let a
 * cross-origin, cookieless page silently log the victim's browser into an
 * attacker-chosen account (login CSRF), and would let a cross-origin,
 * cookieless page clear the victim's cookies via `/api/auth/logout`
 * (forced-logout). Any real browser navigation/fetch/form-post — whether or
 * not it happens to carry a cookie — attaches `Origin` (or `Referer`), so:
 *  - Origin/Referer present => always enforce the match, cookie or not.
 *    This blocks both classic cookie-riding CSRF and cookieless
 *    login/logout CSRF.
 *  - Origin/Referer absent entirely => not a browser page navigation; this
 *    is how a native/mobile client (Expo, curl, server-to-server) looks,
 *    since it never sets these browser-only headers. Exempt it, but only
 *    when it *also* carries no `cookie` header — a request with no cookie
 *    has no ambient credential to steal, so it cannot be a CSRF forgery no
 *    matter what other headers/body it does or doesn't carry (Bearer
 *    header, or a cookieless mobile-transport refresh/logout call (SP-4a
 *    T5) presenting its refresh token via the JSON body or an
 *    `X-Refresh-Token` header).
 *
 * The web flow always sends both its httpOnly auth cookies AND an
 * Origin/Referer header, so it's unconditionally covered by the first
 * branch — completely unchanged from before.
 *
 * Returns a `403` `NextResponse` to short-circuit the caller when the check
 * fails, or `null` when the request should proceed.
 */
export function assertSameOrigin(req: Request): NextResponse | null {
  const origin = req.headers.get('origin') ?? originFromReferer(req.headers.get('referer'));

  if (origin) {
    const expected = allowedOrigin(req);
    if (expected && origin === expected) {
      return null;
    }
    return NextResponse.json({ error: 'CSRF check failed' }, { status: 403 });
  }

  // No Origin/Referer at all => a native (mobile/server) client, not a web
  // page. Exempt only when it also carries no ambient cookie.
  if (!req.headers.get('cookie')) {
    return null;
  }
  return NextResponse.json({ error: 'CSRF check failed' }, { status: 403 });
}
