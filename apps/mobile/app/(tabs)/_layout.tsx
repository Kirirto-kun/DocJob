import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '../../src/providers/session';

/**
 * The 5-tab product shell (SP-4b Task 3 scope: shell + placeholder screens
 * only — real content lands in Task 4/5). Guarded defensively: this layout
 * only ever renders `<Tabs>` for an `'authenticated'` session; anything
 * else (a stale deep link, a logout that happens while already inside the
 * tabs, `'pending'`/`'unauthenticated'`/`'loading'`) bounces to
 * `/(auth)/login` via a declarative `<Redirect>` rather than the tab bar
 * ever mounting. This is what makes "tab bar renders only when
 * authenticated" hold even for direct navigation into `(tabs)`, not just
 * the initial `/` gateway.
 *
 * Labels are plain Russian strings for now — i18n keys land in Task 6.
 * Icons via `@expo/vector-icons`'s `Ionicons` (bundled with Expo, no extra
 * native linking).
 */
export default function TabsLayout() {
  const { status } = useSession();

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
