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
 *
 * `passwordResetBase` (SP-4a Task 3): the client-facing base URL the
 * `users.requestPasswordReset` procedure builds a reset link against (via
 * `buildResetLink`, `@docjob/core`). Deliberately a separate config value
 * from `AUTH_URL` (which doubles as the CSRF same-origin key) — resolved
 * from `PASSWORD_RESET_URL_BASE` with an `AUTH_URL` fallback at each
 * context-construction site.
 *
 * `contactInboxEmail` (SP-4a Task 3 follow-up, folds in a T2 review note):
 * the recipient address `core.contact.sendContactMessage` delivers to.
 * Previously a `CONTACT_INBOX_EMAIL` constant hardcoded inside
 * `contact.service.ts`, duplicating `apps/web/src/lib/site.ts`'s
 * `SITE_EMAIL` (silent-drift risk). Now injected here — every production
 * context-construction site sets it from that same `SITE_EMAIL` constant —
 * so there's one source of truth again, consistent with the injected-
 * `EmailSender` pattern above.
 *
 * `ip` (SP-5 Task 4): the caller's best-effort client IP, derived below from
 * `X-Forwarded-For`/`X-Real-IP` — deliberately OPTIONAL (`undefined` when
 * neither header is present) rather than defaulting to a placeholder like
 * the web login route's `clientIp()` does. This context is shared by every
 * router test that builds an `ApiContext` literal directly (bypassing
 * `createContext`), so making `ip` required would force every one of those
 * literals to supply one; leaving it optional keeps this a purely additive
 * change. It's consumed by `users.requestPasswordReset`'s throttle (see
 * `routers/users.ts`), which falls back to an email-only rate-limit key when
 * `ip` is absent rather than pooling every IP-less caller into one shared
 * bucket (a real risk in local dev / any deployment without a
 * forwarded-header-setting reverse proxy in front).
 */
export type ApiContext = {
  actor: Actor | null;
  email: EmailSender;
  passwordResetBase: string;
  contactInboxEmail: string;
  ip?: string;
};

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
 * Best-effort client IP from standard reverse-proxy headers. Mirrors
 * `apps/web/src/app/api/auth/login/route.ts`'s `clientIp()` (that file
 * can't be imported here — it's web-only, `@docjob/api` stays
 * transport-agnostic) EXCEPT this one returns `undefined` instead of a
 * `'127.0.0.1'` fallback: unlike the login route (a single fixed limiter
 * instance where "no header" realistically only ever means local dev), this
 * context is shared by every tRPC procedure, and defaulting every header-less
 * caller to the same literal string would pool them into one shared
 * rate-limit bucket — see `routers/users.ts`'s `requestPasswordReset`, the
 * one procedure that currently reads `ctx.ip`.
 */
function clientIp(req: Request): string | undefined {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  return undefined;
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
  passwordResetBase: string;
  contactInboxEmail: string;
}): Promise<ApiContext> {
  const config = {
    passwordResetBase: opts.passwordResetBase,
    contactInboxEmail: opts.contactInboxEmail,
    ip: clientIp(opts.req),
  };
  const token = extractToken(opts.req);
  if (!token) return { actor: null, email: opts.email, ...config };

  const claims = await verifyAccessToken(token, opts.keys);
  if (!claims) return { actor: null, email: opts.email, ...config };

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user) return { actor: null, email: opts.email, ...config };

  return {
    actor: { id: user.id, role: user.role, approvedAt: user.approvedAt },
    email: opts.email,
    ...config,
  };
}
