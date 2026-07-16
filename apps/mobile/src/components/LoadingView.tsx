import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';

/**
 * Shared full-screen spinner for every place a route needs to WAIT OUT
 * `useSession().status === 'loading'` rather than redirect or render real
 * content. Extracted from `app/index.tsx` (the "/" gateway's original,
 * still-canonical loading render) so `app/(tabs)/_layout.tsx` can render an
 * identical loading branch instead of redirecting through `/login` while
 * `fetchMe()` is still in flight (SP-4b Task 3 bugfix: that redirect bounced
 * authenticated deep links — push notifications, restored nav state,
 * universal links straight into a tab — through the login screen and back,
 * always losing the original destination in favor of the default tab).
 *
 * `testID` defaults to `'root-loading'` (what `index.test.tsx` already
 * asserts on) but is overridable per call site so two loading views mounted
 * in the same tree (e.g. during a redirect chain in the router-integration
 * tests) can be asserted on independently.
 */
export function LoadingView({ testID = 'root-loading' }: { testID?: string }) {
  return (
    <View style={styles.container} testID={testID}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
