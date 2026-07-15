'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc } from './react';
import { trpcLinks } from './links';

/**
 * Wraps `children` in a `QueryClientProvider` + `trpc.Provider`, giving every
 * client component in the tree access to `trpc.<domain>.<proc>.useQuery`/
 * `useMutation` (SP-2's tRPC React-Query client, `react.ts`).
 *
 * `QueryClient` and the tRPC client are both created once per mount via
 * `useState`'s lazy initializer (not per render) — the standard tRPC+React-
 * Query SSR-safe pattern: creating them at module scope would leak query
 * cache across requests/users on the server, but this file only ever runs in
 * the browser (`'use client'`), so a single stable instance per app session
 * is correct and avoids re-creating the tRPC link (and its `authFetch`
 * closure) on every re-render.
 *
 * This does NOT replace the existing Server Action data flow yet — SP-2
 * Task 1 only wires the client infra. `AppProviders` (`@/components/app-
 * providers.tsx`) mounts this outermost so both existing providers
 * (`UserProvider`/`PatientProvider`/`TagProvider`, still Server-Action-backed)
 * and any future tRPC-hook-based component can coexist during the
 * screen-by-screen migration (SP-2 Tasks 3-6).
 */
export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: trpcLinks(),
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
