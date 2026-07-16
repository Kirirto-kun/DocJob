import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { trpc } from '../../../src/lib/trpc';
import { SUBGROUPS } from '../../../src/lib/taxonomy';
import { submissionStatusColors, submissionStatusLabel } from '../../../src/lib/submission-status';
import type { SerializedSubmission } from '../../../src/lib/api-types';

const MIN_TITLE_LENGTH = 3;
const MIN_DESCRIPTION_LENGTH = 10;

/**
 * "Мои заявки" tab landing screen (SP-4b Task 5): `trpc.submissions.mine`
 * list (own case-submission proposals, most recently active first — see
 * `packages/core/src/submissions/submission.service.ts#getMyCaseSubmissions`)
 * plus an inline "предложить кейс" create form
 * (`trpc.submissions.create`, `CreateCaseSubmissionInput` — title >= 3
 * chars, description >= 10 chars, `authors`/`subgroup`/`attachmentIds` all
 * optional). Attachments aren't offered here — no file-picker dependency is
 * wired into `apps/mobile` yet, matching this task's scope (mobile is the
 * read/submitter side only, no admin CRUD, no upload flows beyond what
 * earlier tasks already wired).
 *
 * Tapping a row pushes `/(tabs)/submissions/<id>` (nested inside this tab's
 * own stack, `./_layout.tsx`) — same push-within-tab-stack shape as
 * `../cases/index.tsx` -> `../cases/[subgroup].tsx`.
 */
export default function SubmissionsIndexScreen() {
  const utils = trpc.useUtils();
  const mineQuery = trpc.submissions.mine.useQuery();
  const createMutation = trpc.submissions.create.useMutation();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subgroup, setSubgroup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = mineQuery.data ?? [];
  const canSubmit =
    title.trim().length >= MIN_TITLE_LENGTH &&
    description.trim().length >= MIN_DESCRIPTION_LENGTH &&
    !createMutation.isPending;

  const onCreate = async () => {
    if (!canSubmit) return;
    setError(null);
    try {
      await createMutation.mutateAsync({
        title: title.trim(),
        description: description.trim(),
        authors: [],
        subgroup,
      });
      setTitle('');
      setDescription('');
      setSubgroup(null);
      setShowForm(false);
      await utils.submissions.mine.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось отправить предложение.');
    }
  };

  return (
    <View style={styles.container} testID="submissions-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Мои заявки</Text>
        <Pressable
          testID="submission-toggle-form"
          onPress={() => setShowForm((v) => !v)}
          style={styles.toggleButton}
        >
          <Text style={styles.toggleButtonText}>{showForm ? 'Отмена' : 'Предложить кейс'}</Text>
        </Pressable>
      </View>

      {showForm ? (
        <View style={styles.form} testID="submission-create-form">
          <TextInput
            testID="submission-title-input"
            style={styles.input}
            placeholder="Название кейса"
            placeholderTextColor="#8a8a8a"
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            testID="submission-description-input"
            style={[styles.input, styles.textarea]}
            placeholder="Опишите ситуацию (минимум 10 символов)"
            placeholderTextColor="#8a8a8a"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
          />

          <View style={styles.chipRow}>
            {SUBGROUPS.map((s) => (
              <Pressable
                key={s.slug}
                testID={`submission-subgroup-${s.slug}`}
                onPress={() => setSubgroup((prev) => (prev === s.slug ? null : s.slug))}
                style={[styles.chip, subgroup === s.slug && styles.chipActive]}
              >
                <Text style={[styles.chipText, subgroup === s.slug && styles.chipTextActive]}>
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {error ? (
            <Text style={styles.error} testID="submission-create-error">
              {error}
            </Text>
          ) : null}

          <Pressable
            testID="submission-submit"
            style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
            onPress={() => void onCreate()}
            disabled={!canSubmit}
          >
            {createMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Отправить</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {mineQuery.isLoading ? (
        <View style={styles.centered} testID="submissions-loading">
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : mineQuery.isError ? (
        <View style={styles.centered} testID="submissions-error">
          <Text style={styles.hint}>Не удалось загрузить заявки. Попробуйте ещё раз.</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered} testID="submissions-empty">
          <Text style={styles.hint}>Вы ещё не предложили ни одного кейса.</Text>
        </View>
      ) : (
        <FlatList
          testID="submissions-list"
          data={items}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <SubmissionRow item={item} onPress={() => router.push(`/(tabs)/submissions/${item.id}`)} />
          )}
        />
      )}
    </View>
  );
}

function SubmissionRow({ item, onPress }: { item: SerializedSubmission; onPress: () => void }) {
  const colors = submissionStatusColors(item.status);
  return (
    <Pressable
      testID={`submission-item-${item.id}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <View style={[styles.badge, { backgroundColor: colors.bg }]}>
          <Text style={[styles.badgeText, { color: colors.text }]}>{submissionStatusLabel(item.status)}</Text>
        </View>
      </View>
      <Text style={styles.cardMeta}>{item.messageCount} сообщений</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  toggleButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toggleButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  form: {
    gap: 10,
    borderWidth: 1,
    borderColor: '#e2e2e2',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#fafafa',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#fff',
  },
  textarea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  chipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  chipText: {
    fontSize: 12,
    color: '#444',
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  error: {
    color: '#c0392b',
    fontSize: 12,
  },
  submitButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  hint: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  listContent: {
    paddingBottom: 24,
  },
  card: {
    borderWidth: 1,
    borderColor: '#e2e2e2',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    backgroundColor: '#fff',
    gap: 6,
  },
  cardPressed: {
    backgroundColor: '#f5f7fb',
    borderColor: '#2563eb',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardMeta: {
    fontSize: 12,
    color: '#666',
  },
});
