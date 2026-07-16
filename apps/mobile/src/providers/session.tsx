import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { fetchMe, login as authLogin, logout as authLogout, onLogout, type LoginResult } from '../lib/auth-client';
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

  const refetch = useCallback(async () => {
    const me = await fetchMe();
    applyMe(me);
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
    });
    return unsubscribe;
  }, []);

  const login = useCallback(
    async (email: string, password: string, deviceLabel?: string): Promise<LoginResult> => {
      const result = await authLogin(email, password, deviceLabel);
      if (result.status === 'ok') {
        // `authLogin` already persisted the token pair; re-fetch `/api/auth/me`
        // for the authoritative full profile rather than trusting the
        // login endpoint's own (identical, but separately-typed) `user`.
        await refetch();
      }
      return result;
    },
    [refetch],
  );

  const logout = useCallback(async () => {
    await authLogout();
    applyMe(null);
  }, [applyMe]);

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
