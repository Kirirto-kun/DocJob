import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter, createContext } from '@docjob/api';
import { verificationKeys } from '@/lib/auth-keys';
import { assertSameOrigin } from '@/lib/csrf';

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
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: ({ req }) => createContext({ req, keys: verificationKeys() }),
  });
}

export { handler as GET, handler as POST };
