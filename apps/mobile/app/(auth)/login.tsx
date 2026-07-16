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
import { useSession } from '../../src/providers/session';

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
          setError('Ваш аккаунт ожидает одобрения администратора.');
          return;
        case 'locked':
          setError(
            `Слишком много попыток входа. Повторите через ${result.retryAfterSeconds} сек.`,
          );
          return;
        case 'invalid':
          setError('Неверный email или пароль.');
          return;
        default:
          setError('Ошибка сети. Попробуйте ещё раз.');
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
        <Text style={styles.brand}>DocJob</Text>
        <Text style={styles.title}>Вход в аккаунт</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            testID="login-email-input"
            style={styles.input}
            placeholder="doctor@example.com"
            placeholderTextColor="#8a8a8a"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Пароль</Text>
          <TextInput
            testID="login-password-input"
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#8a8a8a"
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
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Войти</Text>
          )}
        </Pressable>

        <View style={styles.linksRow}>
          <Text style={styles.hint}>Нет аккаунта? </Text>
          <Link href="/(auth)/register" testID="login-register-link">
            <Text style={styles.link}>Зарегистрироваться</Text>
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
  },
  brand: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 24,
  },
  field: {
    marginBottom: 14,
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  error: {
    color: '#c0392b',
    fontSize: 13,
    marginBottom: 10,
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  linksRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  hint: {
    color: '#666',
  },
  link: {
    color: '#2563eb',
    fontWeight: '600',
  },
});
