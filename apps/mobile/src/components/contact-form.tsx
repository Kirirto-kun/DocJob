import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { colors } from '../theme/colors';

/**
 * Optional "contact support" form, embedded in `app/(tabs)/profile.tsx`
 * (SP-4b Task 5 brief: "an optional Contact form"). `trpc.contact.send` is a
 * `publicProcedure` (no actor needed — anonymous web visitors use the same
 * endpoint) that now actually delivers mail via the injected `EmailSender`
 * port (SP-4a Task 2), so this works uniformly for mobile too, unlike the
 * pre-SP-4a web-only Server Action.
 *
 * `company` is core's honeypot field (`packages/core/src/contact/contact.service.ts`)
 * — real users never see or fill it on the web form; there is no UI for it
 * here either, it's just always sent empty so a tripped-honeypot code path
 * (silent-accept, no email sent) is never accidentally triggered by a
 * legitimate mobile submission.
 */
export function ContactForm() {
  const { t } = useTranslation();
  const sendMutation = trpc.contact.send.useMutation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const canSubmit =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    message.trim().length > 0 &&
    !sendMutation.isPending;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    try {
      await sendMutation.mutateAsync({
        name: name.trim(),
        email: email.trim(),
        message: message.trim(),
        company: '',
      });
      setSent(true);
      setName('');
      setEmail('');
      setMessage('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('contact.errorFallback'));
    }
  };

  return (
    <View style={styles.container} testID="contact-form">
      <Text style={styles.heading}>{t('contact.heading')}</Text>

      {sent ? (
        <Text style={styles.success} testID="contact-form-success">
          {t('contact.success')}
        </Text>
      ) : (
        <>
          <TextInput
            testID="contact-name-input"
            style={styles.input}
            placeholder={t('contact.namePlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            testID="contact-email-input"
            style={styles.input}
            placeholder={t('contact.emailPlaceholder')}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            testID="contact-message-input"
            style={[styles.input, styles.textarea]}
            placeholder={t('contact.messagePlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={4}
          />
          {error ? (
            <Text style={styles.error} testID="contact-form-error">
              {error}
            </Text>
          ) : null}
          <Pressable
            testID="contact-submit"
            style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
            onPress={() => void onSubmit()}
            disabled={!canSubmit}
          >
            {sendMutation.isPending ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.submitButtonText}>{t('contact.submit')}</Text>
            )}
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    backgroundColor: colors.surface,
  },
  heading: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: colors.surfaceElevated,
    color: colors.text,
  },
  textarea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  error: {
    color: colors.danger,
    fontSize: 12,
  },
  success: {
    color: colors.success,
    fontSize: 13,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: colors.onPrimary,
    fontWeight: '600',
    fontSize: 14,
  },
});
