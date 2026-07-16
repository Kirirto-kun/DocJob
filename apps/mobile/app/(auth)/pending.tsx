import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../src/providers/session';

/**
 * Shown after registration (`register.tsx` pushes here directly — see its
 * doc comment on why registering doesn't authenticate) and, defensively,
 * whenever `useSession().status` itself resolves to `'pending'`
 * (`(auth)/_layout.tsx`'s redirect effect). Either way, this screen doesn't
 * assume tokens exist: `logout()` is safe to call even with no active
 * session (`auth-client.ts`'s `logout()` no-ops the network call when there's
 * no local refresh token, but still clears local state) — reachable here
 * mainly for the `status==='pending'` path where a session (and thus real
 * tokens) DOES exist.
 */
export default function PendingScreen() {
  const { t } = useTranslation();
  const { logout } = useSession();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const onLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
      router.replace('/(auth)/login');
    }
  };

  return (
    <View style={styles.container} testID="pending-screen">
      <Text style={styles.title}>{t('auth.pending.title')}</Text>
      <Text style={styles.body}>{t('auth.pending.body')}</Text>

      <Pressable
        testID="pending-logout"
        style={[styles.button, isLoggingOut && styles.buttonDisabled]}
        onPress={onLogout}
        disabled={isLoggingOut}
      >
        {isLoggingOut ? (
          <ActivityIndicator color="#2563eb" />
        ) : (
          <Text style={styles.buttonText}>{t('auth.pending.logout')}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    textAlign: 'center',
    color: '#666',
    lineHeight: 22,
  },
  button: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#2563eb',
    fontWeight: '600',
    fontSize: 15,
  },
});
