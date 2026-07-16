import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '../../src/providers/session';
import { LoadingView } from '../../src/components/LoadingView';

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
 * Labels are plain Russian strings for now — i18n keys land in Task 6.
 * Icons via `@expo/vector-icons`'s `Ionicons` (bundled with Expo, no extra
 * native linking).
 */
export default function TabsLayout() {
  const { status } = useSession();

  if (status === 'loading') {
    return <LoadingView testID="tabs-loading" />;
  }

  if (status !== 'authenticated') {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="search"
        options={{
          title: 'Поиск',
          tabBarIcon: ({ color, size }) => <Ionicons name="search" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="cases"
        options={{
          title: 'Кейсы',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="folder-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: 'Сохранённые',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bookmark-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="submissions"
        options={{
          title: 'Мои заявки',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Профиль',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
