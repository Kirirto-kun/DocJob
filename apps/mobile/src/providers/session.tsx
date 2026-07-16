import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchMe, login as authLogin, logout as authLogout, onLogout, type LoginResult } from '../lib/auth-client';
import { PERSIST_KEY } from '../lib/query-persist';
import type { SerializedUser } from '../lib/api-types';

/**
 * The mobile analog of the web app's `isInitialized` + `currentUser` pair
 * (`apps/web/src/hooks/use-user-store.tsx`), collapsed into one status enum
 * plus a distinct `'pending'` state the web app doesn't need (the web
 * middleware just redirects unauthenticated traffic to `/login`; mobile
 * needs its own approval-gate screen since there's no server-rendered
 * redirect).
 *
 * - `'loading'`   — `fetchMe()` hasn't resolved yet since mount. Gate ALL UI
 *   on `status !== 'loading'`, same discipline as `isInitialized` on web.
 * - `'unauthenticated'` — no valid session (`fetchMe()` resolved `null`).
 * - `'pending'`   — a resolved user whose `approvedAt` is `null`. NOTE: in
 *   the current backend (`packages/auth/src/login.service.ts`), a pending
 *   (unapproved) account's `login()` call returns `{status:'pending'}`
 *   WITHOUT issuing tokens at all, so `fetchMe()` can't actually observe
 *   this shape through today's login flow — `login()` below surfaces that
 *   case directly from `LoginResult` instead (see `login.tsx`, which shows
 *   the "ожидает одобрения" message from the returned `LoginResult`, not
 *   from `status`). This derivation is kept anyway because it's the
 *   contract this provider is specified against (and the literal test the
 *   brief asks for): forward-compatible with any future path that DOES
 *   resolve a pending user's own profile (e.g. an admin-impersonation token,
 *   or a backend change that issues a restricted token pre-approval).
 * - `'authenticated'` — a resolved, approved user.
 */
export type SessionStatus = 'loading' | 'unauthenticated' | 'pending' | 'authenticated';

export type Session = {
  user: SerializedUser | null;
  status: SessionStatus;
  login: (email: string, password: string, deviceLabel?: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

function statusForUser(user: SerializedUser | null): SessionStatus {
  if (!user) return 'unauthenticated';
  return user.approvedAt ? 'authenticated' : 'pending';
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SerializedUser | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const queryClient = useQueryClient();

  /**
   * Guards against `onLogout` firing more than once for the same
   * logged-out episode. `authFetch` (T2, `../lib/auth-client.ts`) emits
   * `onLogout` once PER concurrent failed request in a batch — e.g. 3
   * screens each issuing a query that 401s at the same moment, whose shared
   * refresh then fails, fire the listener 3 times. Without this latch,
   * the listener body would still be idempotent in practice (React bails
   * out redundant `setState` calls to the same value), but the latch makes
   * that guarantee explicit and cheap rather than relying on React's
   * reference-equality bailout, and gives later code (e.g. a one-shot
   * "session expired" toast) a safe place to hang a "only once" rule.
   * Reset back to `false` whenever a fresh `me` is loaded (mount, a
   * successful login, or an explicit `refetch`) so a LATER logout can fire
   * again.
   */
  const loggedOutRef = useRef(false);

  const applyMe = useCallback((me: SerializedUser | null) => {
    loggedOutRef.current = false;
    setUser(me);
    setStatus(statusForUser(me));
  }, []);

  /**
   * Review fix (whole-branch review, Important): the offline-persist cache
   * (T6, `../lib/query-persist.ts`) writes the WHOLE React Query cache to
   * AsyncStorage under `PERSIST_KEY`, and query keys are per-procedure+input
   * — NOT per-user. Left uncleared on logout, a shared device would let the
   * NEXT user who logs in instantly see the PREVIOUS user's cached
   * `users.me`/`saved.list`/`submissions.mine`/`reviews.mine` (all PII),
   * either from the in-memory `QueryClient` (`staleTime` 5min, no refetch
   * needed) or from the persisted blob (up to `PERSIST_MAX_AGE_MS` = 24h,
   * even across an app restart) — a real cross-user data-exposure seam for a
   * medical app. `queryClient.clear()` empties the in-memory cache;
   * `AsyncStorage.removeItem(PERSIST_KEY)` drops the on-disk snapshot so a
   * subsequent `restoreClient()` (next app start, before any user is logged
   * in) has nothing stale to rehydrate. Both operations are idempotent, so
   * this is safe to call from multiple logout paths without guarding against
   * double-invocation.
   */
  const clearAllCaches = useCallback(async () => {
    queryClient.clear();
    await AsyncStorage.removeItem(PERSIST_KEY);
  }, [queryClient]);

  const refetch = useCallback(async () => {
    try {
      const me = await fetchMe();
      applyMe(me);
    } catch {
      // `fetchMe` (via `authFetch` -> `fetch`) has no network-error handling
      // of its own, so a plain connectivity failure — an offline cold
      // start is the single most common mobile condition — rejects here.
      // Left uncaught, `status` would stay `'loading'` forever (an infinite
      // spinner with no recovery, since the mount effect below awaits this
      // with no `.catch`). Resolve to a definite, retryable state instead:
      // `'unauthenticated'` lands the user on the login screen, and
      // `refetch()`/a fresh login attempt both work once connectivity is
      // back.
      applyMe(null);
    }
  }, [applyMe]);

  useEffect(() => {
    // `react-hooks/set-state-in-effect` flags this because `refetch` (via
    // `applyMe`) calls `setUser`/`setStatus` — but only AFTER `await
    // fetchMe()` resolves, i.e. in a later microtask, never synchronously
    // within this effect's own commit. That's exactly the standard "fetch
    // on mount" pattern react.dev itself documents (see "Fetching data" at
    // https://react.dev/learn/synchronizing-with-effects) — the rule's
    // actual target (setState called synchronously, causing a same-tick
    // cascading re-render) doesn't apply here, so this is a deliberate,
    // justified suppression rather than an unexamined one.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch();
    // Intentionally mount-only: `refetch` is stable across renders (its own
    // dependency, `applyMe`, has an empty dep array), so this never needs to
    // re-run beyond the initial mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unsubscribe = onLogout(() => {
      if (loggedOutRef.current) return;
      loggedOutRef.current = true;
      setUser(null);
      setStatus('unauthenticated');
      // A forced logout (refresh failure — expired/revoked/reused refresh
      // token) must wipe the cache exactly like an explicit `logout()` does;
      // otherwise the next user to log in on this device would still
      // restore the previous user's cached PII. `loggedOutRef` above already
      // de-dupes the onLogout burst for a single failed-refresh episode, so
      // this only runs once per episode (and `clearAllCaches` is idempotent
      // regardless).
      void clearAllCaches();
    });
    return unsubscribe;
  }, [clearAllCaches]);

  const login = useCallback(
    async (email: string, password: string, deviceLabel?: string): Promise<LoginResult> => {
      const result = await authLogin(email, password, deviceLabel);
      if (result.status === 'ok') {
        // `authLogin` already persisted the token pair AND already returned
        // the full `SerializedUser` (same shape `fetchMe()` would resolve).
        // Apply it directly instead of an extra `fetchMe()` round-trip: a
        // post-login network blip on that follow-up call would otherwise
        // (pre-Fix-1, an unhandled rejection; even with Fix-1's try/catch,
        // a false "logged out") strand or misreport a login that already
        // succeeded and already persisted tokens.
        applyMe(result.user);
      }
      return result;
    },
    [applyMe],
  );

  const logout = useCallback(async () => {
    await authLogout();
    applyMe(null);
    await clearAllCaches();
  }, [applyMe, clearAllCaches]);

  const value: Session = { user, status, login, logout, refetch };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
