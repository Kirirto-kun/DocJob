import { cookies } from 'next/headers';
import { verifyAccessToken } from '@docjob/auth';
import { prisma } from '@docjob/db';
import type { User } from '@prisma/client';
import { getAccessToken, ACCESS_COOKIE_NAMES } from './auth-cookies';
import { verificationKeys } from './auth-keys';

/**
 * Verifies an access-token string (if any) and re-reads the corresponding
 * `User` row from Postgres by `claims.sub` — the DB read, not the JWT's own
 * `role`/`approvedAt` claims, is the authority source, so an admin
 * de-approving or promoting a user takes effect on the very next request
 * rather than only after the ~15m access token naturally expires (the JWT
 * claims are only ever used as the identity pointer here). Shared by
 * `getCurrentUser()` and `getUserFromRequest()` below — they differ only in
 * *where* the token comes from.
 */
async function resolveUser(token: string | undefined): Promise<User | null> {
  if (!token) return null;

  const claims = await verifyAccessToken(token, verificationKeys());
  if (!claims) return null;

  return prisma.user.findUnique({ where: { id: claims.sub } });
}

/**
 * The single per-request session read for Server Components/Actions
 * (mirrors `GET /api/auth/me`'s route.ts logic for API callers — see that
 * file's comment). Reads the access-token cookie via `next/headers`'
 * ambient `cookies()`, which only reflects the request currently being
 * rendered — for an arbitrary API route handler's own `Request`, use
 * `getUserFromRequest` instead.
 */
export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  return resolveUser(getAccessToken(cookieStore));
}

/**
 * Extracts a bearer token from `Authorization: Bearer <jwt>`, if present.
 * Exported so route handlers that need Bearer-first/cookie-fallback token
 * resolution but must return a *serialized* user (`GET /api/auth/me` — see
 * that route) can reuse this single parse instead of `getUserFromRequest`
 * below, which resolves to the raw Prisma `User` row.
 */
export function bearerToken(req: Request): string | undefined {
  const header = req.headers.get('authorization');
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1];
}

/**
 * Extracts the access-token cookie from a raw `Request`'s `cookie` header.
 * Checks both cookie-name variants (`ACCESS_COOKIE_NAMES`, from
 * `auth-cookies.ts`) regardless of the current deployment's https-ness — the
 * same way `packages/api/src/context.ts`'s `cookieToken` does. Can't reuse
 * `next/headers`' `cookies()` here: it only reflects the ambient request
 * being rendered, not an arbitrary route handler's own `req`.
 */
function cookieToken(req: Request): string | undefined {
  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return undefined;

  const pairs = cookieHeader.split(';');
  for (const name of ACCESS_COOKIE_NAMES) {
    for (const pair of pairs) {
      const eq = pair.indexOf('=');
      if (eq === -1) continue;
      const key = pair.slice(0, eq).trim();
      if (key !== name) continue;
      const value = pair.slice(eq + 1).trim();
      if (value) return decodeURIComponent(value);
    }
  }
  return undefined;
}

/**
 * Request-driven variant of `getCurrentUser()` for API route handlers that
 * need to authenticate an arbitrary `Request` directly — in particular, a
 * mobile client sending `Authorization: Bearer <jwt>` and no cookies at all
 * (e.g. `GET /api/attachments/[filename]`, which `next/headers`' ambient
 * `cookies()`-based `getCurrentUser()` can't see). Mirrors
 * `packages/api/src/context.ts`'s token extraction: the Bearer header takes
 * precedence, falling back to the access cookie, so a REST route handler
 * and the tRPC endpoint authenticate a given request identically.
 */
export async function getUserFromRequest(req: Request): Promise<User | null> {
  const token = bearerToken(req) ?? cookieToken(req);
  return resolveUser(token);
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
