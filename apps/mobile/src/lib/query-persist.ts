import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Persister } from '@tanstack/react-query-persist-client';

/**
 * Offline React Query persistence (SP-4b Task 6). `@tanstack/react-query-persist-client`
 * only ships the generic `PersistQueryClientProvider` + the 3-method
 * `Persister` interface (`persistClient`/`restoreClient`/`removeClient`) — it
 * does NOT bundle a ready-made AsyncStorage adapter (that used to be the
 * separate `@tanstack/query-async-storage-persister` package, which isn't a
 * dependency here per the brief's dep list — only `@tanstack/react-query-persist-client`
 * + `@react-native-async-storage/async-storage` were installed in T1). So
 * this hand-rolls the same shape that package's `createAsyncStoragePersister`
 * provides: read/write one JSON blob under a single AsyncStorage key.
 *
 * **What gets persisted, and what deliberately never does:** `PersistedClient`
 * (see `@tanstack/query-persist-client-core`'s `persist.ts`) serializes
 * exactly `dehydrate(queryClient)`'s output — i.e. ONLY entries that live in
 * the `QueryClient`'s query cache. The access/refresh JWTs never enter that
 * cache at all: they live in `expo-secure-store` via `./token-store.ts`, read
 * directly by `./auth-client.ts`'s `authFetch`, and the session's `user`
 * object lives in `SessionProvider`'s own React `useState`
 * (`../providers/session.tsx`) — neither is ever passed through
 * `trpc.*.useQuery`/`useMutation`. So "the persister only holds query data"
 * holds by construction, not by an extra filter here. As defense in depth,
 * `dehydrateOptions.shouldDehydrateMutation` below still explicitly excludes
 * ALL mutations (react-query's own default already excludes non-paused ones —
 * see `defaultShouldDehydrateMutation` — but mutation variables can carry
 * raw form input, e.g. `contact.send`'s message body or `users.updateProfile`'s
 * fields; being explicit here removes any doubt rather than relying on a
 * library default nobody re-reads).
 *
 * Exported (SP-4b Task 6 review fix) so `../providers/session.tsx` can drop
 * the persisted blob directly on logout — query keys are per-procedure+input,
 * NOT per-user, so on a shared device the NEXT user to log in would otherwise
 * restore the PREVIOUS user's cached `users.me`/`saved.list`/`submissions.mine`/
 * `reviews.mine` (all PII) straight from disk. See `SessionProvider`'s
 * `clearAllCaches` for the in-memory + on-disk clear this key backs.
 */
export const PERSIST_KEY = 'docjob.query-cache';

export function createAsyncStoragePersister(): Persister {
  return {
    persistClient: async (persistedClient) => {
      await AsyncStorage.setItem(PERSIST_KEY, JSON.stringify(persistedClient));
    },
    restoreClient: async () => {
      const raw = await AsyncStorage.getItem(PERSIST_KEY);
      if (!raw) return undefined;
      return JSON.parse(raw);
    },
    removeClient: async () => {
      await AsyncStorage.removeItem(PERSIST_KEY);
    },
  };
}

/** Never persist mutations — queries only (see the module doc comment above). */
export function shouldDehydrateMutation(): boolean {
  return false;
}

/**
 * `gcTime` must be >= the persister's `maxAge` (React Query's own
 * documented requirement — a query garbage-collected from the in-memory
 * cache before the persisted snapshot expires would otherwise be silently
 * dropped on the next restore). Both set to 24h: comfortably covers
 * "closed the app overnight, opened it on the train with no signal" while
 * still bounding how stale an offline read can be.
 */
export const PERSIST_MAX_AGE_MS = 1000 * 60 * 60 * 24;
export const QUERY_GC_TIME_MS = PERSIST_MAX_AGE_MS;

/**
 * `staleTime`: data is treated as fresh for 5 minutes, so returning to a
 * screen (foregrounding the app, switching tabs) within that window reads
 * straight from cache — including the persisted, restored-from-disk cache
 * when offline — instead of firing a network request that's guaranteed to
 * fail. Short enough that a doctor actively using the app still sees
 * reasonably current Search/Cases/Saved/News data once connectivity returns.
 */
export const QUERY_STALE_TIME_MS = 1000 * 60 * 5;

/**
 * A version tag for the persisted shape itself (react-query's `buster`
 * option) — bump this if a future change alters what `dehydrate()` produces
 * in an incompatible way, to discard old on-disk caches instead of trying
 * (and failing) to hydrate them.
 */
export const PERSIST_BUSTER = 'v1';

/**
 * Folded fix (T4 Minor): don't retry a tRPC `TOO_MANY_REQUESTS` error at
 * all — `search.search`'s rate limiter (`packages/api/src/routers/search.ts`)
 * throws this when the 30-req/60s budget is exhausted, and React Query's
 * default retry (3 attempts with exponential backoff) would silently burn
 * ~7 more seconds retrying a request the server has already told us to stop
 * making, delaying the rate-limit banner (`app/(tabs)/search.tsx`'s
 * `search-rate-limited` state) well past when the user actually pressed
 * "Найти". Every other query error still gets a couple of retries (`< 2`,
 * i.e. up to 2 retries after the first attempt — cheap insurance against a
 * single transient network blip without piling on for a real outage).
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const code = (error as { data?: { code?: unknown } } | null | undefined)?.data?.code;
  if (code === 'TOO_MANY_REQUESTS') return false;
  return failureCount < 2;
}
