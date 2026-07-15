import { httpBatchLink, type TRPCLink } from '@trpc/client';
import type { AppRouter } from '@docjob/api';
import { authFetch } from '@/lib/auth-client';

/**
 * The tRPC client's transport link(s), used by `provider.tsx`'s
 * `trpc.createClient()`. A single `httpBatchLink` against `/api/trpc`
 * (SP-1d's mounted route handler, `src/app/api/trpc/[trpc]/route.ts`).
 *
 * `fetch: authFetch` is the whole point of this file: `authFetch` (`@/lib/
 * auth-client.ts`) already implements the single-flight 401 → refresh →
 * retry interceptor used by every other authenticated `/api/*` call in the
 * app. Reusing it here — rather than re-implementing the refresh dance —
 * means a tRPC call issued after the ~15m access token has expired
 * transparently refreshes and retries exactly like a plain `fetch` call
 * does, and concurrent tRPC + non-tRPC 401s still share the same in-flight
 * refresh promise (see `auth-client.ts`'s doc comment on why that matters:
 * the raw refresh token is single-use, so parallel independent refresh
 * attempts would trigger reuse-detection and log the user out).
 *
 * Cookies are same-origin and sent automatically by the browser — no
 * `credentials` override needed.
 */
export function trpcLinks(): TRPCLink<AppRouter>[] {
  return [
    httpBatchLink({
      url: '/api/trpc',
      fetch: authFetch,
    }),
  ];
}
