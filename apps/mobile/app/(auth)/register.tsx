import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { trpc } from '../../src/lib/trpc';
import { colors } from '../../src/theme/colors';

/**
 * Self-registration screen. Calls the public `trpc.users.register`
 * mutation directly (core's `registerUser` — see
 * `packages/core/src/users/user.service.ts` — requires `email`,
 * `password` (min 6), `name`; everything else, including `role`, is
 * optional and defaults to `DOCTOR`). Registration does NOT log the user
 * in (no tokens are issued — approval happens out of band), so on success
 * this pushes straight to `/pending` rather than relying on
 * `useSession().status`, which stays `'unauthenticated'` the whole time.
 *
 * Richer profile fields (specialty/region/phone/etc., matching the web
 * registration form) are deferred to a later task — this is the minimal
 * field set core actually requires.
 */
export default function RegisterScreen() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const registerMutation = trpc.users.register.useMutation();

  const canSubmit =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= 6 &&
    !registerMutation.isPending;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    try {
      await registerMutation.mutateAsync({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      router.replace('/(auth)/pending');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('auth.register.errorFallback'));
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} testID="register-screen">
        <Text style={styles.brand}>{t('common.appName')}</Text>
        <Text style={styles.title}>{t('auth.register.title')}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>{t('auth.register.nameLabel')}</Text>
          <TextInput
            testID="register-name-input"
            style={styles.input}
            placeholder={t('auth.register.namePlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('auth.register.emailLabel')}</Text>
          <TextInput
            testID="register-email-input"
            style={styles.input}
            placeholder="doctor@example.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('auth.register.passwordLabel')}</Text>
          <TextInput
            testID="register-password-input"
            style={styles.input}
            placeholder={t('auth.register.passwordPlaceholder')}
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </View>

        {error ? (
          <Text style={styles.error} testID="register-error">
            {error}
          </Text>
        ) : null}

        <Pressable
          testID="register-submit"
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={!canSubmit}
        >
          {registerMutation.isPending ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.buttonText}>{t('auth.register.submit')}</Text>
          )}
        </Pressable>

        <View style={styles.linksRow}>
          <Text style={styles.hint}>{t('auth.register.haveAccount')}</Text>
          <Link href="/(auth)/login" testID="register-login-link">
            <Text style={styles.link}>{t('auth.register.loginCta')}</Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 4,
    backgroundColor: colors.background,
  },
  brand: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
    color: colors.text,
  },
  title: {
    fontSize: 16,
    textAlign: 'center',
    color: colors.textMuted,
    marginBottom: 24,
  },
  field: {
    marginBottom: 14,
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: colors.surfaceElevated,
    color: colors.text,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    marginBottom: 10,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.onPrimary,
    fontWeight: '600',
    fontSize: 15,
  },
  linksRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  hint: {
    color: colors.textMuted,
  },
  link: {
    color: colors.primary,
    fontWeight: '600',
  },
});
