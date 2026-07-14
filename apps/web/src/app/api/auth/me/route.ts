import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@docjob/auth';
import * as core from '@docjob/core';
import { getAccessToken } from '@/lib/auth-cookies';
import { verificationKeys } from '@/lib/auth-keys';

// Node runtime: re-reads the user from Postgres after verifying the JWT
// (jose itself is Edge-safe, but the DB round trip isn't — this route is
// the client session source for Task 6's cutover, not the Edge middleware
// check, so Node here is fine).
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const token = getAccessToken(req.cookies);
  if (!token) {
    return NextResponse.json({ user: null });
  }

  const claims = await verifyAccessToken(token, verificationKeys());
  if (!claims) {
    return NextResponse.json({ user: null });
  }

  const user = await core.users.getUserById(claims.sub);
  return NextResponse.json({ user });
}
