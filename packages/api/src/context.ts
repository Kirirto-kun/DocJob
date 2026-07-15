import type { Actor, EmailSender } from '@docjob/core';
import { verifyAccessToken, type SigningKey } from '@docjob/auth';
import { prisma } from '@docjob/db';

/**
 * Candidate access-token cookie names, mirroring
 * `apps/web/src/lib/auth-cookies.ts`'s `accessCookieName()` — that helper
 * picks between these two based on whether the deployment is https
 * (production, gets the `__Host-` prefix) or plain local http dev (browsers
 * reject `__Host-`/`__Secure-` on a cookie that isn't `Secure`, so dev falls
 * back to the bare name).
 *
 * This package can't import `auth-cookies.ts` directly to reuse its
 * function: that file imports `NextResponse` from `next/server`, which this
 * package's transport-agnostic boundary forbids (see boundary.test.ts).
 * Both literal names are checked here instead, so a rename on either side
 * shows up as a failing integration test rather than a silent auth bypass.
 */
const ACCESS_COOKIE_NAMES = ['docjob-access', '__Host-docjob-access'];

/**
 * `email` (SP-4a Task 2): an injected `EmailSender` port so domain services
 * called through this context (e.g. `core.contact.sendContactMessage`) can
 * deliver mail without `@docjob/api`/`@docjob/core` importing an email
 * provider SDK directly — the web mount injects a Resend-backed adapter
 * (`apps/web/src/app/api/trpc/[trpc]/route.ts`), the in-process caller
 * (`apps/web/src/lib/trpc/server.ts`) reuses the same adapter, and tests
 * inject a spy/no-op.
 */
export type ApiContext = { actor: Actor | null; email: EmailSender };

function bearerToken(req: Request): string | undefined {
  const header = req.headers.get('authorization');
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1];
}

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
 * Extracts the access-token string from an incoming `Request`: a mobile
 * client's `Authorization: Bearer <jwt>` header takes precedence, falling
 * back to the web app's httpOnly access cookie so the same tRPC context
 * works for both transports.
 */
function extractToken(req: Request): string | undefined {
  return bearerToken(req) ?? cookieToken(req);
}

/**
 * Builds the tRPC context for one request: verifies the access token (if
 * any), then re-reads the `User` row from Postgres by `claims.sub` — the DB
 * read, not the JWT's own `role`/`approvedAt` claims, is the authority
 * source (mirrors `apps/web/src/lib/session.ts`'s `getCurrentUser`), so a
 * role change or de-approval takes effect on the very next request rather
 * than only after the access token naturally expires.
 *
 * Any failure — missing token, malformed/expired/tampered token, or a
 * verified token whose user row no longer exists — resolves to
 * `{ actor: null }` rather than throwing; procedures that require a caller
 * use `protectedProcedure` (see trpc.ts) to enforce that.
 */
export async function createContext(opts: {
  req: Request;
  keys: SigningKey[];
  email: EmailSender;
}): Promise<ApiContext> {
  const token = extractToken(opts.req);
  if (!token) return { actor: null, email: opts.email };

  const claims = await verifyAccessToken(token, opts.keys);
  if (!claims) return { actor: null, email: opts.email };

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user) return { actor: null, email: opts.email };

  return { actor: { id: user.id, role: user.role, approvedAt: user.approvedAt }, email: opts.email };
}
