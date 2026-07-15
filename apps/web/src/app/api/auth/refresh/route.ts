import { NextRequest, NextResponse } from 'next/server';
import { rotateRefresh, revokeFamily, signAccessToken } from '@docjob/auth';
import * as core from '@docjob/core';
import { assertSameOrigin } from '@/lib/csrf';
import { getRefreshTokenFromRequest, setAuthCookies, clearAuthCookies } from '@/lib/auth-cookies';
import { signingKey } from '@/lib/auth-keys';

// Node runtime: rotates the refresh token in Postgres and (on success)
// signs a fresh access JWT — not Edge-safe.
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const csrfFailure = assertSameOrigin(req);
  if (csrfFailure) return csrfFailure;

  // Cookie first (web, unchanged), then body `{ refresh }` / `X-Refresh-Token`
  // header (mobile/native — never carries a cookie at all).
  const raw = await getRefreshTokenFromRequest(req);
  if (!raw) {
    const res = NextResponse.json({ error: 'No refresh token' }, { status: 401 });
    clearAuthCookies(res);
    return res;
  }

  const rotated = await rotateRefresh(raw);
  if (!rotated || 'revoked' in rotated) {
    const res = NextResponse.json({ error: 'Session invalid' }, { status: 401 });
    clearAuthCookies(res);
    return res;
  }

  // Re-read the user from the DB rather than trusting anything cached — an
  // admin may have de-approved this account since the refresh token was
  // issued, and that must take effect on the very next refresh, not just on
  // next login.
  const user = await core.users.getUserById(rotated.userId);
  if (!user || !user.approvedAt) {
    await revokeFamily(rotated.familyId, 'user-not-approved');
    const res = NextResponse.json({ error: 'Account not approved' }, { status: 401 });
    clearAuthCookies(res);
    return res;
  }

  const access = await signAccessToken(
    { sub: user.id, role: user.role, approvedAt: user.approvedAt },
    signingKey(),
  );

  // Same additive body-vs-cookie shape as login: the rotated tokens are
  // returned in the JSON body too, for a mobile client with no cookies to
  // read them from. Still the single rotation performed above — the
  // `newRaw` handed to the client here is the only copy that will ever
  // work (the old raw is now single-use-spent).
  const res = NextResponse.json({
    user,
    access,
    refresh: rotated.newRaw,
    refreshExpiresAt: rotated.expiresAt,
  });
  setAuthCookies(res, {
    access,
    refresh: rotated.newRaw,
    refreshExpiresAt: rotated.expiresAt,
  });
  return res;
}
