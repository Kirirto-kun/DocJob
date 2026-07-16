import { useState, type ReactNode } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n';
import { trpc, makeTRPCClient } from '../lib/trpc';
import {
  createAsyncStoragePersister,
  PERSIST_BUSTER,
  PERSIST_MAX_AGE_MS,
  QUERY_GC_TIME_MS,
  QUERY_STALE_TIME_MS,
  shouldDehydrateMutation,
  shouldRetryQuery,
} from '../lib/query-persist';
import { SessionProvider } from './session';

/**
 * Root provider stack for the whole app, mounted once from
 * `app/_layout.tsx`. Nesting (outermost first):
 *
 *   I18nextProvider -> PersistQueryClientProvider -> trpc.Provider -> SessionProvider -> children
 *
 * `I18nextProvider` is outermost (SP-4b Task 6) so every provider/screen
 * below it — including `SessionProvider`'s own error copy, if it ever grows
 * any — can call `useTranslation()`. Wiring the already-initialized global
 * `i18n` singleton (`../i18n/index.ts`, side-effect-initialized at import
 * time) here isn't strictly required for `useTranslation()` to work (per
 * react-i18next, `initReactI18next` already registers a default instance
 * globally), but makes the dependency explicit and matches the brief's
 * "wire the provider into app-providers.tsx".
 *
 * `PersistQueryClientProvider` (SP-4b Task 6, `@tanstack/react-query-persist-client`)
 * replaces the plain `QueryClientProvider` T3 originally wired here — same
 * `QueryClient` instance and `useState` lazy-initializer discipline (created
 * once per app session, not at module scope, so recreating a fresh
 * `authFetch`-bound tRPC link on every re-render is avoided — matches
 * `apps/web/src/lib/trpc/provider.tsx`'s rationale), now additionally wired
 * to `../lib/query-persist.ts`'s hand-rolled AsyncStorage `Persister` so
 * Search/Cases/Saved/News reads survive an app restart while offline. See
 * that module's doc comment for exactly what does (query data only) and
 * does NOT (tokens, mutations) get persisted.
 *
 * `defaultOptions.queries.retry`/`gcTime`/`staleTime` are set on the
 * `QueryClient` itself (not per-call) so every screen's `useQuery` inherits
 * them without repeating the config — `retry` is the folded T4 Minor fix
 * (`shouldRetryQuery`: never retries a `TOO_MANY_REQUESTS` tRPC error, so
 * `app/(tabs)/search.tsx`'s rate-limit banner appears immediately instead of
 * after ~7s of futile retries; still retries other transient errors up to a
 * small cap).
 *
 * `SessionProvider` (T3) stays innermost so it can read `trpc`/react-query
 * context if a later task needs `useUtils()`/cache invalidation from
 * session-level code (e.g. clearing cached queries on logout).
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: shouldRetryQuery,
            gcTime: QUERY_GC_TIME_MS,
            staleTime: QUERY_STALE_TIME_MS,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => makeTRPCClient());
  const [persister] = useState(() => createAsyncStoragePersister());

  return (
    <I18nextProvider i18n={i18n}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: PERSIST_MAX_AGE_MS,
          buster: PERSIST_BUSTER,
          dehydrateOptions: { shouldDehydrateMutation },
        }}
      >
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <SessionProvider>{children}</SessionProvider>
        </trpc.Provider>
      </PersistQueryClientProvider>
    </I18nextProvider>
  );
}
