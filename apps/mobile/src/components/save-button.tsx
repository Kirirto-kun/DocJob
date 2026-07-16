import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { colors } from '../theme/colors';

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
  const { t } = useTranslation();
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
      setError(e instanceof Error ? e.message : t('saveButton.errorFallback'));
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
        <ActivityIndicator size="small" color={saved ? colors.onPrimary : colors.primary} />
      ) : (
        <Text style={[styles.text, saved && styles.textSaved]} testID="save-button-label">
          {saved ? t('saveButton.saved') : t('saveButton.save')}
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
    borderColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSaved: {
    backgroundColor: colors.primary,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  text: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  textSaved: {
    color: colors.onPrimary,
  },
  error: {
    color: colors.danger,
    fontSize: 11,
    marginTop: 4,
  },
});
