import { Redirect } from 'expo-router';
import { useSession } from '../src/providers/session';
import { LoadingView } from '../src/components/LoadingView';

/**
 * The initial "/" gateway route. Cold-launches the app here; once
 * `useSession().status` resolves (T3's `SessionProvider`, mounted by the
 * root layout), redirects into the approval-gated auth stack or the tab
 * shell — mirrors the web app's `isInitialized`-gated role branch
 * (`apps/web/src/app/page.tsx`).
 *
 * `'pending'` routes to `(auth)` too (not a route of its own) — `(auth)`'s
 * own layout (`app/(auth)/_layout.tsx`) is what actually lands a pending
 * session on the `pending` screen specifically.
 */
export default function Index() {
  const { status } = useSession();

  if (status === 'loading') {
    return <LoadingView />;
  }

  if (status === 'authenticated') {
    return <Redirect href="/(tabs)/search" />;
  }

  return <Redirect href="/(auth)/login" />;
}
