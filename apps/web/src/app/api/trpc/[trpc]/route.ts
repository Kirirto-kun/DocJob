import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { EmailSender } from '@docjob/core';
import { appRouter, createContext } from '@docjob/api';
import { verificationKeys } from '@/lib/auth-keys';
import { assertSameOrigin } from '@/lib/csrf';
import { sendEmail } from '@/lib/email';
import { SITE_EMAIL } from '@/lib/site';
import { logger, newRequestId } from '@/lib/logger';

/**
 * `EmailSender` adapter (SP-4a Task 2) backing `ApiContext.email` for every
 * request through this mount — wraps the Resend-backed `sendEmail`
 * (`@/lib/email`) so `core.contact.sendContactMessage` (and any future core
 * flow that takes an `EmailSender`) can deliver mail without `@docjob/api`/
 * `@docjob/core` importing the `resend` package or its env vars directly.
 */
const webEmailSender: EmailSender = { send: (message) => sendEmail(message) };

/**
 * `passwordResetBase` (SP-4a Task 3): the client-facing base URL
 * `users.requestPasswordReset` builds a reset link against. Deliberately
 * decoupled from `AUTH_URL` (which doubles as the CSRF same-origin key) via
 * its own `PASSWORD_RESET_URL_BASE` env var, falling back to `AUTH_URL` and
 * finally a local-dev default so this never throws at request time.
 */
const passwordResetBase =
  process.env.PASSWORD_RESET_URL_BASE ?? process.env.AUTH_URL ?? 'http://localhost:3000';

/**
 * `contactInboxEmail` (SP-4a Task 3 follow-up): the recipient
 * `core.contact.sendContactMessage` delivers to — sourced from the same
 * `SITE_EMAIL` constant the rest of the web app uses (SEO metadata, etc.),
 * instead of a separate hardcoded constant living inside `@docjob/core`.
 */
const contactInboxEmail = SITE_EMAIL;

// Node runtime: `createContext` (see packages/api/src/context.ts) verifies
// the access token with jose (Edge-safe on its own) but then re-reads the
// `User` row from Postgres via `@docjob/db`'s Prisma client, which isn't
// Edge-safe. Every domain router built on top of it also touches Prisma
// (and, for `structureFromMarkdown`, the OpenAI SDK), so the whole handler
// stays on the Node runtime — mirrors `/api/auth/*`'s routes.
export const runtime = 'nodejs';

/**
 * Mounts `@docjob/api`'s `appRouter` at `/api/trpc` via tRPC's web-standard
 * fetch adapter. `createContext` is handed the SAME `verificationKeys()`
 * helper `/api/auth/*` and the Edge middleware use (built from
 * `AUTH_SECRET`/`AUTH_SECRET_PREVIOUS`), so a request's access token is
 * verified identically regardless of which surface it arrives through.
 *
 * Auth itself is NOT decided here: `createContext` resolves `ctx.actor`
 * (bearer header, else the access cookie — see context.ts) and each
 * procedure tier (`publicProcedure`/`protectedProcedure`/`reviewerProcedure`/
 * `adminProcedure`) enforces its own requirement, returning a standard tRPC
 * `UNAUTHORIZED`/`FORBIDDEN` error. This route handler is transport plumbing
 * only — see `src/middleware.ts` for why unauthenticated requests are
 * allowed to reach this handler in the first place rather than being
 * redirected/blocked upstream.
 */
function handler(req: Request) {
  // CSRF: a state-changing tRPC call arrives as an HTTP POST (a mutation, or a
  // batch that may contain one); reads are GETs. For cookie-authenticated POSTs
  // require a same-origin Origin/Referer, so a cross-site page can't forge a
  // mutation that rides on the victim's cookies. `assertSameOrigin` exempts
  // bearer-only requests (no cookie) — they can't be CSRF'd — so the mobile/API
  // path is unaffected. GET queries are read-only and need no check.
  if (req.method === 'POST') {
    const csrfBlock = assertSameOrigin(req);
    if (csrfBlock) return csrfBlock;
  }
  // Request-scoped id, logged only alongside genuinely unexpected failures
  // (see `onError` below) — cheap correlation for grepping `docker compose
  // logs web`, without threading it through `@docjob/api`'s context (that
  // package stays transport-agnostic; a request id is web-transport plumbing).
  const requestId = newRequestId();
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: ({ req }) =>
      createContext({ req, keys: verificationKeys(), email: webEmailSender, passwordResetBase, contactInboxEmail }),
    onError: ({ error, path, type }) => {
      // `errorMapping` in packages/api/src/trpc.ts already turns every
      // recognized `DomainError` into a specific TRPCError code
      // (UNAUTHORIZED/BAD_REQUEST/FORBIDDEN/NOT_FOUND/CONFLICT) — that's
      // expected control flow, not a bug, and isn't logged here. Only the
      // default `INTERNAL_SERVER_ERROR` wrap (an unrecognized thrown value —
      // a real bug, a Prisma error, an OpenAI SDK error, ...) is worth an
      // operator's attention.
      if (error.code === 'INTERNAL_SERVER_ERROR') {
        // `error` itself is tRPC's wrapper (`getTRPCErrorFromUnknown`); the
        // original raw thrown value (a real bug, a Prisma error, an OpenAI
        // SDK error, ...) is stashed on `.cause`. Log that so the stack
        // trace points at the actual throw site, not tRPC's wrapping code.
        const original = error.cause instanceof Error ? error.cause : error;
        logger.error('unhandled tRPC error', { requestId, path, type, err: original });
      }
    },
  });
}

export { handler as GET, handler as POST };
