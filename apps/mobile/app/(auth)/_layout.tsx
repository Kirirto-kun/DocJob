import { useEffect } from 'react';
import { Stack, router, usePathname } from 'expo-router';
import { useSession } from '../../src/providers/session';
import { colors } from '../../src/theme/colors';

/**
 * Layout for the unauthenticated/pending auth stack (`login`, `register`,
 * `pending`). Two defensive redirects, both imperative (`router.replace`)
 * rather than declarative `<Redirect>`s, so they don't fight the two
 * explicit navigations that already happen elsewhere:
 *
 *  - `register.tsx` pushes to `/pending` on successful registration WHILE
 *    `status` is still `'unauthenticated'` (registering doesn't log you
 *    in — see `session.tsx`'s doc comment on why `'pending'` is normally
 *    unreachable via the login flow itself). A guard here must not bounce
 *    that navigation back to `/login`.
 *  - `login.tsx` doesn't itself navigate on success; `useSession().login`
 *    flips `status` to `'authenticated'`, and THIS effect is what then
 *    moves the user into `(tabs)`.
 *
 * So: redirect to `/(tabs)/search` once `status` becomes `'authenticated'`
 * (covers the login-success case); redirect to `/pending` if `status`
 * becomes `'pending'` while sitting on a different `(auth)` screen (covers
 * the — today unreachable in practice, but spec'd — case where a resolved
 * session's own user turns out unapproved). Neither effect touches the
 * `'unauthenticated'` case, so the post-register push to `/pending` is
 * left alone.
 */
export default function AuthLayout() {
  const { status } = useSession();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/(tabs)/search');
    } else if (status === 'pending' && pathname !== '/pending') {
      router.replace('/(auth)/pending');
    }
  }, [status, pathname]);

  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="pending" />
    </Stack>
  );
}
