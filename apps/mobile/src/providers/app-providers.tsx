import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc, makeTRPCClient } from '../lib/trpc';
import { SessionProvider } from './session';

/**
 * Root provider stack for the whole app, mounted once from
 * `app/_layout.tsx`. Nesting (outermost first, per the SP-4b Task 3 brief):
 *
 *   QueryClientProvider -> trpc.Provider -> SessionProvider -> children
 *
 * `QueryClient` and the tRPC client (`makeTRPCClient()`, T2 —
 * `httpBatchLink` over `authFetch`, no transformer) are both created once
 * per app session via `useState`'s lazy initializer, not at module scope —
 * matches `apps/web/src/lib/trpc/provider.tsx`'s rationale (avoids
 * recreating the link, and its `authFetch` closure, on every re-render).
 * `SessionProvider` (T3) is innermost so it can read `trpc`/react-query
 * context if a later task needs `useUtils()`/cache invalidation from
 * session-level code (e.g. clearing cached queries on logout).
 *
 * i18n (RU+KK, `react-i18next`) is wired in Task 6 — no placeholder needed
 * here; screens use plain Russian strings until then (see
 * `.superpowers/sdd/task-3-brief.md`).
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => makeTRPCClient());

  return (
    <QueryClientProvider client={queryClient}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <SessionProvider>{children}</SessionProvider>
      </trpc.Provider>
    </QueryClientProvider>
  );
}
