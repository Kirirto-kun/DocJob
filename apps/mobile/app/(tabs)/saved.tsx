import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { trpc } from '../../src/lib/trpc';
import { CaseCard } from '../../src/components/case-card';
import type { SavedCaseItem } from '../../src/lib/api-types';

/**
 * "Сохранённые" tab (SP-4b Task 5). `trpc.saved.list` resolves
 * `SavedCaseItem[]` (`../../src/lib/api-types.ts`) — each entry wraps a
 * `CaseListItem`-shaped `case` summary (see
 * `packages/core/src/saved/saved.service.ts`'s `SerializedSavedCase`, which
 * intentionally reuses the same case-list-item shape `cases.listPaged`
 * returns) plus the bookmark's own `id`/`caseId`/`createdAt` — so this
 * reuses `../../src/components/case-card.tsx` (T4) directly for the card,
 * passing `item.case` straight through with no re-shaping.
 *
 * Unsave is `trpc.saved.toggle` (idempotent per `(userId, caseId)`, same
 * mutation `../../src/components/save-button.tsx` uses on the case-detail
 * screen) — on success this invalidates `saved.list` (this screen),
 * `saved.isSaved`, and `saved.ids` so a case-detail screen the user later
 * opens for the same case reflects the unsaved state immediately, matching
 * `save-button.tsx`'s own 3-way invalidation.
 */
export default function SavedScreen() {
  const utils = trpc.useUtils();
  const savedQuery = trpc.saved.list.useQuery();
  const toggleMutation = trpc.saved.toggle.useMutation();
  const [error, setError] = useState<string | null>(null);

  const items = savedQuery.data ?? [];

  const onUnsave = async (caseId: string) => {
    setError(null);
    try {
      await toggleMutation.mutateAsync(caseId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось убрать кейс из сохранённых.');
      return;
    }
    await Promise.all([
      utils.saved.list.invalidate(),
      utils.saved.isSaved.invalidate(caseId),
      utils.saved.ids.invalidate(),
    ]);
  };

  return (
    <View style={styles.container} testID="saved-screen">
      <Text style={styles.title}>Сохранённые</Text>

      {error ? (
        <Text style={styles.error} testID="saved-error-banner">
          {error}
        </Text>
      ) : null}

      {savedQuery.isLoading ? (
        <View style={styles.centered} testID="saved-loading">
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : savedQuery.isError ? (
        <View style={styles.centered} testID="saved-error">
          <Text style={styles.hint}>Не удалось загрузить сохранённые кейсы. Попробуйте ещё раз.</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered} testID="saved-empty">
          <Text style={styles.hint}>У вас пока нет сохранённых кейсов.</Text>
        </View>
      ) : (
        <FlatList
          testID="saved-list"
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <SavedCaseRow
              item={item}
              unsaving={toggleMutation.isPending && toggleMutation.variables === item.caseId}
              onUnsave={() => void onUnsave(item.caseId)}
            />
          )}
        />
      )}
    </View>
  );
}

function SavedCaseRow({
  item,
  onUnsave,
  unsaving,
}: {
  item: SavedCaseItem;
  onUnsave: () => void;
  unsaving: boolean;
}) {
  return (
    <View style={styles.row} testID={`saved-case-${item.caseId}`}>
      <CaseCard item={item.case} onPress={() => router.push(`/case/${item.caseId}`)} />
      <Pressable
        testID={`unsave-${item.caseId}`}
        onPress={onUnsave}
        disabled={unsaving}
        style={[styles.unsaveButton, unsaving && styles.unsaveButtonDisabled]}
      >
        {unsaving ? (
          <ActivityIndicator size="small" color="#c0392b" />
        ) : (
          <Text style={styles.unsaveButtonText}>Убрать из сохранённых</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
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
  error: {
    color: '#c0392b',
    fontSize: 13,
  },
  listContent: {
    paddingBottom: 24,
  },
  row: {
    marginBottom: 4,
  },
  unsaveButton: {
    alignSelf: 'flex-start',
    marginTop: -4,
    marginBottom: 12,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  unsaveButtonDisabled: {
    opacity: 0.6,
  },
  unsaveButtonText: {
    fontSize: 12,
    color: '#c0392b',
    fontWeight: '600',
  },
});
