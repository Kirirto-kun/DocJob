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
import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../src/providers/session';
import { colors } from '../../src/theme/colors';

/**
 * Login screen. Submits via `useSession().login` (T3's `SessionProvider`,
 * which delegates to `../../src/lib/auth-client.ts`'s `login()` — Bearer
 * tokens persisted to SecureStore, no cookies). A successful login flips
 * `useSession().status` to `'authenticated'`, which `(auth)/_layout.tsx`
 * observes and navigates away from this screen — this component itself
 * never navigates on success.
 *
 * Error copy mirrors the route's own discriminant
 * (`packages/auth/src/login.service.ts`'s `LoginResult`, surfaced via
 * `auth-client.ts`'s `LoginResult`): `pending` = correct credentials but not
 * yet admin-approved, `invalid` = unknown email or wrong password
 * (deliberately indistinguishable, same anti-enumeration property as web),
 * `locked` = rate-limited (`retryAfterSeconds` from the 429 body), `error` =
 * network/parse failure.
 */
export default function LoginScreen() {
  const { t } = useTranslation();
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !isSubmitting;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await login(email.trim(), password);
      switch (result.status) {
        case 'ok':
          // (auth)/_layout.tsx redirects once `status` flips to 'authenticated'.
          return;
        case 'pending':
          setError(t('auth.login.errors.pending'));
          return;
        case 'locked':
          setError(t('auth.login.errors.locked', { seconds: result.retryAfterSeconds }));
          return;
        case 'invalid':
          setError(t('auth.login.errors.invalid'));
          return;
        default:
          setError(t('auth.login.errors.network'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} testID="login-screen">
        <Text style={styles.brand}>{t('common.appName')}</Text>
        <Text style={styles.title}>{t('auth.login.title')}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>{t('auth.login.emailLabel')}</Text>
          <TextInput
            testID="login-email-input"
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
          <Text style={styles.label}>{t('auth.login.passwordLabel')}</Text>
          <TextInput
            testID="login-password-input"
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </View>

        {error ? (
          <Text style={styles.error} testID="login-error">
            {error}
          </Text>
        ) : null}

        <Pressable
          testID="login-submit"
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={!canSubmit}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.buttonText}>{t('auth.login.submit')}</Text>
          )}
        </Pressable>

        <View style={styles.linksRow}>
          <Text style={styles.hint}>{t('auth.login.noAccount')}</Text>
          <Link href="/(auth)/register" testID="login-register-link">
            <Text style={styles.link}>{t('auth.login.registerCta')}</Text>
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
