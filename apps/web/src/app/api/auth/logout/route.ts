import { NextRequest, NextResponse } from 'next/server';
import { hashRefreshToken, revokeFamily } from '@docjob/auth';
import { prisma } from '@docjob/db';
import { assertSameOrigin } from '@/lib/csrf';
import { getRefreshToken, clearAuthCookies } from '@/lib/auth-cookies';

// Node runtime: looks up + revokes the refresh-token family in Postgres.
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const csrfFailure = assertSameOrigin(req);
  if (csrfFailure) return csrfFailure;

  const raw = getRefreshToken(req);
  if (raw) {
    // Plain lookup by hash (not `rotateRefresh` — logout must not mint a
    // new token, just kill the family the presented one belongs to).
    const row = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(raw) },
    });
    if (row) {
      await revokeFamily(row.familyId, 'logout');
    }
  }

  const res = NextResponse.json({ ok: true });
  clearAuthCookies(res);
  return res;
}
