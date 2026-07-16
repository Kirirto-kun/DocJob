import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '../src/providers/app-providers';
import { colors } from '../src/theme/colors';

/**
 * Root layout: mounts the full provider stack (QueryClient + tRPC +
 * SessionProvider, `../src/providers/app-providers.tsx`) around a plain
 * `Stack`. This layout itself does no auth-based branching — that lives in
 * `app/index.tsx` (the initial "/" gateway, which redirects to `(auth)` or
 * `(tabs)` based on `useSession().status`), `app/(auth)/_layout.tsx`
 * (redirects a `(auth)` screen to `(tabs)` once `status` becomes
 * `'authenticated'`), and `app/(tabs)/_layout.tsx` (redirects back to
 * `(auth)` if `status` isn't `'authenticated'`). Splitting the gate this way
 * — rather than one big conditional here — keeps each layer independently
 * defensive: a stale deep link straight into `(tabs)` or `(auth)` is caught
 * by that group's own layout, not just by the initial "/" redirect.
 */
export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="light" />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
      />
    </AppProviders>
  );
}
