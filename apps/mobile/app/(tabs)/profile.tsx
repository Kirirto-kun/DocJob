import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { trpc } from '../../src/lib/trpc';
import { useSession } from '../../src/providers/session';
import { resolveMediaUrl } from '../../src/lib/config';
import { ContactForm } from '../../src/components/contact-form';
import { setLanguage, type SupportedLanguage } from '../../src/i18n';

/**
 * "Профиль" tab (SP-4b Task 5). Reads the current user via
 * `trpc.users.me` (rather than `useSession().user`) so the screen reflects
 * an edit immediately via `utils.users.me.invalidate()` without depending on
 * `SessionProvider` re-running `fetchMe()` — `users.me`/`SerializedUser`
 * (`../../src/lib/api-types.ts`) is the exact same wire shape either way
 * (`packages/core/src/users/user.mapper.ts`), just fetched through a
 * different query key. Role-gated affordances (the reviewer-only "Мои
 * рецензии" link) read `role` off this SAME query result, so they can never
 * disagree with what `users.me` itself would say.
 *
 * Edit covers `name` + `profilePhotoUrl` only (a URL text field, not an
 * image picker/upload flow — no `expo-image-picker`-equivalent dependency is
 * wired into `apps/mobile` yet; entering a URL still exercises the real
 * `trpc.users.updateProfile` mutation end-to-end). The richer professional
 * fields (specialty/region/phone/workplace/academicDegree) that the web
 * profile page also edits are out of scope for this task.
 *
 * Logout uses `useSession().logout()` (T3) — clears tokens + local session
 * state — then replaces the stack root with `/(auth)/login`, same pattern as
 * `app/(auth)/pending.tsx`'s own logout button.
 *
 * The language toggle (SP-4b Task 6) calls `../../src/i18n`'s `setLanguage`
 * directly — that module (not this screen) owns `i18next.changeLanguage` +
 * the AsyncStorage persistence, so every screen's `useTranslation()` re-
 * renders with the new catalog immediately and the choice survives an app
 * restart. Highlighted chip reflects `i18n.language` (via `useTranslation()`
 * itself, which re-renders on language change) rather than separate local
 * state, so it can never disagree with what's actually active.
 */
export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const { logout } = useSession();
  const utils = trpc.useUtils();
  const meQuery = trpc.users.me.useQuery();
  const updateMutation = trpc.users.updateProfile.useMutation();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const user = meQuery.data ?? null;
  const canReview = user?.role === 'ADMIN' || user?.role === 'REVIEWER';

  const onSelectLanguage = (language: SupportedLanguage) => {
    void setLanguage(language);
  };

  const startEdit = () => {
    if (!user) return;
    setName(user.name);
    setPhotoUrl(user.profilePhotoUrl ?? '');
    setEditError(null);
    setEditing(true);
  };

  const onSave = async () => {
    if (!user) return;
    setEditError(null);
    try {
      await updateMutation.mutateAsync({
        id: user.id,
        name: name.trim(),
        profilePhotoUrl: photoUrl.trim() || null,
      });
      await utils.users.me.invalidate();
      setEditing(false);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : t('profile.saveErrorFallback'));
    }
  };

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
    <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="profile-screen">
      <Text style={styles.title}>{t('profile.title')}</Text>

      {meQuery.isLoading ? (
        <ActivityIndicator testID="profile-loading" size="large" color="#2563eb" />
      ) : !user ? (
        <Text style={styles.hint} testID="profile-error">
          {t('profile.loadError')}
        </Text>
      ) : (
        <View style={styles.card} testID="profile-card">
          {user.profilePhotoUrl ? (
            <Image
              testID="profile-photo"
              source={{ uri: resolveMediaUrl(user.profilePhotoUrl) }}
              style={styles.avatar}
            />
          ) : (
            <View style={styles.avatarPlaceholder} testID="profile-photo-placeholder">
              <Text style={styles.avatarInitial}>
                {(user.fullName || user.name || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          {editing ? (
            <View style={styles.form} testID="profile-edit-form">
              <Text style={styles.label}>{t('profile.nameLabel')}</Text>
              <TextInput
                testID="profile-name-input"
                style={styles.input}
                value={name}
                onChangeText={setName}
              />
              <Text style={styles.label}>{t('profile.photoLabel')}</Text>
              <TextInput
                testID="profile-photo-input"
                style={styles.input}
                value={photoUrl}
                onChangeText={setPhotoUrl}
                placeholder="https://..."
                placeholderTextColor="#8a8a8a"
                autoCapitalize="none"
                autoCorrect={false}
              />

              {editError ? (
                <Text style={styles.error} testID="profile-edit-error">
                  {editError}
                </Text>
              ) : null}

              <View style={styles.formButtons}>
                <Pressable
                  testID="profile-save"
                  style={styles.saveButton}
                  onPress={() => void onSave()}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.saveButtonText}>{t('profile.save')}</Text>
                  )}
                </Pressable>
                <Pressable
                  testID="profile-cancel-edit"
                  style={styles.cancelButton}
                  onPress={() => setEditing(false)}
                >
                  <Text style={styles.cancelButtonText}>{t('profile.cancel')}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.info}>
              <Text style={styles.name}>{user.fullName || user.name}</Text>
              <Text style={styles.email}>{user.email}</Text>
              <Pressable testID="profile-edit-start" style={styles.editButton} onPress={startEdit}>
                <Text style={styles.editButtonText}>{t('profile.edit')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('profile.languageTitle')}</Text>
        <View style={styles.languageRow} testID="language-toggle">
          <Pressable
            testID="language-ru"
            onPress={() => onSelectLanguage('ru')}
            style={[styles.langChip, i18n.language === 'ru' && styles.langChipActive]}
          >
            <Text style={[styles.langChipText, i18n.language === 'ru' && styles.langChipTextActive]}>
              {t('profile.languageRu')}
            </Text>
          </Pressable>
          <Pressable
            testID="language-kk"
            onPress={() => onSelectLanguage('kk')}
            style={[styles.langChip, i18n.language === 'kk' && styles.langChipActive]}
          >
            <Text style={[styles.langChipText, i18n.language === 'kk' && styles.langChipTextActive]}>
              {t('profile.languageKk')}
            </Text>
          </Pressable>
        </View>
      </View>

      <Pressable testID="profile-news-link" style={styles.linkRow} onPress={() => router.push('/news')}>
        <Text style={styles.linkRowText}>{t('profile.newsLink')}</Text>
        <Text style={styles.linkRowChevron}>›</Text>
      </Pressable>

      {canReview ? (
        <Pressable
          testID="profile-my-reviews-link"
          style={styles.linkRow}
          onPress={() => router.push('/reviewer/my-reviews')}
        >
          <Text style={styles.linkRowText}>{t('profile.myReviewsLink')}</Text>
          <Text style={styles.linkRowChevron}>›</Text>
        </Pressable>
      ) : null}

      <ContactForm />

      <Pressable
        testID="profile-logout"
        style={[styles.logoutButton, isLoggingOut && styles.logoutButtonDisabled]}
        onPress={() => void onLogout()}
        disabled={isLoggingOut}
      >
        {isLoggingOut ? (
          <ActivityIndicator color="#c0392b" />
        ) : (
          <Text style={styles.logoutButtonText}>{t('profile.logout')}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  hint: {
    fontSize: 14,
    color: '#666',
  },
  card: {
    borderWidth: 1,
    borderColor: '#e2e2e2',
    borderRadius: 10,
    padding: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#eef2ff',
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 28,
    fontWeight: '700',
    color: '#2563eb',
  },
  info: {
    alignItems: 'center',
    gap: 4,
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  email: {
    fontSize: 13,
    color: '#666',
  },
  editButton: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  editButtonText: {
    color: '#2563eb',
    fontWeight: '600',
    fontSize: 13,
  },
  form: {
    width: '100%',
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#444',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  error: {
    color: '#c0392b',
    fontSize: 12,
  },
  formButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#444',
    fontWeight: '600',
    fontSize: 14,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#666',
    letterSpacing: 0.5,
  },
  languageRow: {
    flexDirection: 'row',
    gap: 8,
  },
  langChip: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  langChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  langChipText: {
    fontSize: 13,
    color: '#444',
  },
  langChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  languageHint: {
    fontSize: 11,
    color: '#999',
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e2e2',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#fff',
  },
  linkRowText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  linkRowChevron: {
    fontSize: 16,
    color: '#999',
  },
  logoutButton: {
    borderWidth: 1,
    borderColor: '#c0392b',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  logoutButtonDisabled: {
    opacity: 0.5,
  },
  logoutButtonText: {
    color: '#c0392b',
    fontWeight: '600',
    fontSize: 15,
  },
});
