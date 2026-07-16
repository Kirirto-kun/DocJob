import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../src/providers/session';
import { LoadingView } from '../../src/components/LoadingView';
import { AnnouncementModal } from '../../src/components/announcement-modal';

/**
 * The 5-tab product shell (SP-4b Task 3 scope: shell + placeholder screens
 * only — real content lands in Task 4/5). Guarded defensively: this layout
 * only ever renders `<Tabs>` for an `'authenticated'` session; anything
 * else (a stale deep link, a logout that happens while already inside the
 * tabs, `'pending'`/`'unauthenticated'`) bounces to `/(auth)/login` via a
 * declarative `<Redirect>` rather than the tab bar ever mounting. This is
 * what makes "tab bar renders only when authenticated" hold even for direct
 * navigation into `(tabs)`, not just the initial `/` gateway.
 *
 * `'loading'` gets its OWN branch, checked before the redirect, rather than
 * falling into the `!== 'authenticated'` bucket above: `fetchMe()` hasn't
 * resolved yet at that point, so we don't yet know whether the session is
 * actually authenticated. Redirecting here would bounce a deep link straight
 * into a tab (push notification, restored nav state, universal link — e.g.
 * `/(tabs)/saved`) through `/login` and back once `status` resolves, which
 * always lands on the default `/(tabs)/search` tab instead of the one
 * originally requested. Waiting instead means: once `status` resolves to
 * `'authenticated'`, this component just renders straight through to the
 * requested tab — no bounce, no lost destination. Same discipline as
 * `app/index.tsx`'s `'loading'` branch, hence the shared `LoadingView`.
 *
 * Labels come from `tabs.*` i18n keys (SP-4b Task 6, `../../src/i18n/{ru,kk}.json`).
 * Icons via `@expo/vector-icons`'s `Ionicons` (bundled with Expo, no extra
 * native linking).
 *
 * `<AnnouncementModal />` (SP-4b Task 5, `../../src/components/announcement-modal.tsx`)
 * is mounted as a sibling of `<Tabs>`, inside this SAME `'authenticated'`
 * branch — so its `trpc.announcements.active` query only ever runs for a
 * logged-in, approved session (never inside `(auth)`), matching the brief's
 * "on an authenticated session" requirement without needing its own
 * `enabled` flag.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const { status } = useSession();

  if (status === 'loading') {
    return <LoadingView testID="tabs-loading" />;
  }

  if (status !== 'authenticated') {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <>
      <AnnouncementModal />
      <Tabs screenOptions={{ headerShown: false }}>
        <Tabs.Screen
          name="search"
          options={{
            title: t('tabs.search'),
            tabBarIcon: ({ color, size }) => <Ionicons name="search" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="cases"
          options={{
            title: t('tabs.cases'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="folder-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="saved"
          options={{
            title: t('tabs.saved'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="bookmark-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="submissions"
          options={{
            title: t('tabs.submissions'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="document-text-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t('tabs.profile'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person-outline" color={color} size={size} />
            ),
          }}
        />
      </Tabs>
    </>
  );
}
