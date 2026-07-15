import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
// Type-only — see `src/__tests__/boundary.test.ts` and `eslint.config.js`:
// a value import of `@docjob/api` would drag `@docjob/core` (prisma/argon2/
// openai) into the React Native bundle.
import type { AppRouter } from '@docjob/api';
import { API_BASE_URL } from './config';
import { authFetch } from './auth-client';

/**
 * The `AppRouter`-typed React-Query bindings, mirroring
 * `apps/web/src/lib/trpc/react.ts`'s `createTRPCReact` setup.
 * `trpc.Provider` + the query/mutation hooks (`trpc.cases.list.useQuery()`,
 * ...) are consumed from here once T3's session provider mounts a
 * `QueryClientProvider` + `trpc.Provider` around the app.
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * Builds the actual `trpc.createClient()` instance. A single
 * `httpBatchLink` against `${API_BASE_URL}/api/trpc`, using `authFetch`
 * (`./auth-client.ts`) as the transport — so every tRPC call gets the same
 * Bearer-attach + single-flight-401-refresh-retry behavior as a plain
 * `authFetch` call, and a tRPC call issued after the ~15m access token
 * expires transparently refreshes and retries instead of failing outright.
 *
 * Deliberately no `transformer` — the wire format between `apps/mobile` and
 * `@docjob/api` is plain JSON, matching the web client's httpBatchLink
 * (`apps/web/src/lib/trpc/links.ts`), which also configures none.
 *
 * A function (not a module-scope singleton) so callers (T3's session
 * provider) can create one client instance per app session via `useState`'s
 * lazy initializer — mirrors `apps/web/src/lib/trpc/provider.tsx`'s pattern.
 */
export function makeTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${API_BASE_URL}/api/trpc`,
        fetch: authFetch,
      }),
    ],
  });
}
