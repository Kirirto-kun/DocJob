import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { trpc } from '../../src/lib/trpc';
import { subgroupLabel } from '../../src/lib/taxonomy';
import type { SerializedReviewWithCase } from '../../src/lib/api-types';

/**
 * "Мои рецензии" — a reviewer/admin-only pushed route reached from
 * `app/(tabs)/profile.tsx`'s role-gated link. `trpc.reviews.mine` is
 * `protectedProcedure` (any approved actor may call it — core's
 * `getMyReviews` just returns an empty list for someone who's never
 * reviewed, there's no server-side role gate on the READ), so the ADMIN/
 * REVIEWER restriction on reaching this screen is a client-side UX
 * decision (only reviewers/admins ever author reviews in the first place —
 * `reviews.create` IS reviewer-gated, see `../../src/components/reviews-panel.tsx`),
 * not a security boundary this screen itself needs to re-enforce.
 *
 * `trpc.reviews.delete` mirrors `reviews-panel.tsx`'s own delete flow
 * exactly (author-or-admin, enforced server-side) — invalidates
 * `reviews.mine` on success so the deleted entry disappears immediately.
 */
export default function MyReviewsScreen() {
  const utils = trpc.useUtils();
  const reviewsQuery = trpc.reviews.mine.useQuery();
  const deleteMutation = trpc.reviews.delete.useMutation();
  const [error, setError] = useState<string | null>(null);

  const items = reviewsQuery.data ?? [];

  const onDelete = async (id: string) => {
    setError(null);
    try {
      await deleteMutation.mutateAsync(id);
      await utils.reviews.mine.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить рецензию.');
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      testID="my-reviews-screen"
    >
      <Pressable testID="my-reviews-back" onPress={() => router.back()} hitSlop={8}>
        <Text style={styles.back}>{'‹ Профиль'}</Text>
      </Pressable>
      <Text style={styles.title}>Мои рецензии</Text>

      {error ? (
        <Text style={styles.error} testID="my-reviews-error-banner">
          {error}
        </Text>
      ) : null}

      {reviewsQuery.isLoading ? (
        <View style={styles.centered} testID="my-reviews-loading">
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : reviewsQuery.isError ? (
        <View style={styles.centered} testID="my-reviews-error">
          <Text style={styles.hint}>Не удалось загрузить рецензии.</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered} testID="my-reviews-empty">
          <Text style={styles.hint}>Вы ещё не оставили ни одной рецензии.</Text>
        </View>
      ) : (
        <View style={styles.list} testID="my-reviews-list">
          {items.map((r) => (
            <ReviewRow
              key={r.id}
              review={r}
              onPress={() => router.push(`/case/${r.case.id}`)}
              onDelete={() => void onDelete(r.id)}
              deleting={deleteMutation.isPending}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function ReviewRow({
  review,
  onPress,
  onDelete,
  deleting,
}: {
  review: SerializedReviewWithCase;
  onPress: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <View style={styles.card} testID={`my-review-${review.id}`}>
      <Pressable onPress={onPress} testID={`my-review-case-${review.id}`}>
        <Text style={styles.caseName}>{review.case.name}</Text>
        <Text style={styles.caseSubgroup}>{subgroupLabel(review.case.subgroup)}</Text>
      </Pressable>
      <Text style={styles.reviewBody}>{review.body}</Text>
      <Pressable
        testID={`my-review-delete-${review.id}`}
        onPress={onDelete}
        disabled={deleting}
        style={styles.deleteButton}
      >
        <Text style={styles.deleteButtonText}>Удалить</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  back: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '600',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  error: {
    color: '#c0392b',
    fontSize: 13,
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
  list: {
    gap: 10,
  },
  card: {
    borderWidth: 1,
    borderColor: '#e2e2e2',
    borderRadius: 10,
    padding: 14,
    gap: 6,
    backgroundColor: '#fff',
  },
  caseName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  caseSubgroup: {
    fontSize: 12,
    color: '#666',
  },
  reviewBody: {
    fontSize: 13,
    lineHeight: 18,
    color: '#333',
  },
  deleteButton: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  deleteButtonText: {
    fontSize: 12,
    color: '#c0392b',
    fontWeight: '600',
  },
});
