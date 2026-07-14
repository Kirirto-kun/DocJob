import { cookies } from 'next/headers';
import { verifyAccessToken } from '@docjob/auth';
import { prisma } from '@docjob/db';
import type { User } from '@prisma/client';
import { getAccessToken } from './auth-cookies';
import { verificationKeys } from './auth-keys';

/**
 * The single per-request session read for Server Components/Actions
 * (mirrors `GET /api/auth/me`'s route.ts logic for API callers — see that
 * file's comment). Verifies the access-token cookie (jose, cheap) and then
 * re-reads the user row from Postgres by `claims.sub` — the DB read, not the
 * JWT's own `role`/`approvedAt` claims, is the authority source, so an admin
 * de-approving or promoting a user takes effect on the very next request
 * rather than only after the ~15m access token naturally expires (the JWT
 * claims are only ever used as the identity pointer here).
 */
export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = getAccessToken(cookieStore);
  if (!token) return null;

  const claims = await verifyAccessToken(token, verificationKeys());
  if (!claims) return null;

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  return user;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error('UNAUTHORIZED');
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== 'ADMIN') throw new Error('FORBIDDEN');
  return user;
}
