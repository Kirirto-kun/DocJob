import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { trpc } from '../lib/trpc';

type SaveButtonProps = {
  caseId: string;
};

/**
 * Bookmark toggle for a case, self-contained (owns its own query + mutation
 * + cache invalidation) — mirrors `apps/web/src/components/save-case-button.tsx`'s
 * shape so callers (`app/case/[id].tsx`) only need to pass a `caseId`.
 *
 * `trpc.saved.isSaved` resolves `{ saved: boolean }`; `trpc.saved.toggle` is
 * idempotent per `(userId, caseId)` (`packages/core/src/saved/saved.service.ts`)
 * and itself returns the new `{ saved }` state. On success this invalidates
 * `saved.isSaved` (this case), `saved.list`, and `saved.ids` (the Saved tab
 * and any other screen reading the bookmark set) so every consumer resyncs —
 * required by the Task 4 brief ("invalidate isSaved + saved list on toggle").
 */
export function SaveButton({ caseId }: SaveButtonProps) {
  const utils = trpc.useUtils();
  const isSavedQuery = trpc.saved.isSaved.useQuery(caseId);
  const toggleMutation = trpc.saved.toggle.useMutation();
  const [error, setError] = useState<string | null>(null);

  const saved = isSavedQuery.data?.saved ?? false;
  const pending = toggleMutation.isPending;
  const disabled = pending || isSavedQuery.isLoading;

  const onPress = async () => {
    setError(null);
    try {
      await toggleMutation.mutateAsync(caseId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось изменить статус сохранения.');
      return;
    }
    await Promise.all([
      utils.saved.isSaved.invalidate(caseId),
      utils.saved.list.invalidate(),
      utils.saved.ids.invalidate(),
    ]);
  };

  return (
    <Pressable
      testID="save-button"
      onPress={() => void onPress()}
      disabled={disabled}
      style={[styles.button, saved && styles.buttonSaved, disabled && styles.buttonDisabled]}
    >
      {pending ? (
        <ActivityIndicator size="small" color={saved ? '#fff' : '#2563eb'} />
      ) : (
        <Text style={[styles.text, saved && styles.textSaved]} testID="save-button-label">
          {saved ? 'Сохранено' : 'Сохранить'}
        </Text>
      )}
      {error ? (
        <Text style={styles.error} testID="save-button-error">
          {error}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSaved: {
    backgroundColor: '#2563eb',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  text: {
    color: '#2563eb',
    fontWeight: '600',
    fontSize: 14,
  },
  textSaved: {
    color: '#fff',
  },
  error: {
    color: '#c0392b',
    fontSize: 11,
    marginTop: 4,
  },
});
