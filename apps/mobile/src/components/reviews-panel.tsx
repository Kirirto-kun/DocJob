import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { trpc } from '../lib/trpc';
import { useSession } from '../providers/session';
import type { SerializedReview } from '../lib/api-types';

type ReviewsPanelProps = {
  caseId: string;
};

const MIN_REVIEW_LENGTH = 10;

/**
 * Reviews list + compose + delete for a case detail screen
 * (`app/case/[id].tsx`), self-contained like `../components/save-button.tsx`
 * — owns `trpc.reviews.forCase`/`create`/`delete` and reads the session
 * itself rather than taking the role as a prop.
 *
 * Reviewer gating (SP-4b Task 4 brief, mirrors
 * `apps/web/src/components/case-reviews-panel.tsx`'s `canWrite`): the
 * compose UI is rendered ONLY for `useSession().user?.role === 'ADMIN' |
 * 'REVIEWER'` — doctors (and anyone unauthenticated, though that state is
 * unreachable on a protected screen) get a read-only list. Delete is offered
 * per-review for the review's own author OR an admin, matching core's own
 * rule in `packages/core/src/reviews/review.service.ts`'s `deleteReview`
 * (this is just an early UI affordance — core re-checks ownership
 * server-side regardless, so a stale client can't bypass it).
 */
export function ReviewsPanel({ caseId }: ReviewsPanelProps) {
  const { user } = useSession();
  const utils = trpc.useUtils();
  const reviewsQuery = trpc.reviews.forCase.useQuery(caseId);
  const createMutation = trpc.reviews.create.useMutation();
  const deleteMutation = trpc.reviews.delete.useMutation();

  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canWrite = user?.role === 'ADMIN' || user?.role === 'REVIEWER';
  const reviews = reviewsQuery.data ?? [];
  const canSubmit = draft.trim().length >= MIN_REVIEW_LENGTH && !createMutation.isPending;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    try {
      await createMutation.mutateAsync({ caseId, body: draft.trim() });
      setDraft('');
      await Promise.all([
        utils.reviews.forCase.invalidate(caseId),
        utils.reviews.mine.invalidate(),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось добавить рецензию.');
    }
  };

  const onDelete = async (id: string) => {
    setError(null);
    try {
      await deleteMutation.mutateAsync(id);
      await Promise.all([
        utils.reviews.forCase.invalidate(caseId),
        utils.reviews.mine.invalidate(),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить рецензию.');
    }
  };

  return (
    <View style={styles.container} testID="reviews-panel">
      <Text style={styles.heading}>Рецензии</Text>

      {canWrite ? (
        <View style={styles.compose} testID="reviews-compose">
          <TextInput
            testID="review-draft-input"
            style={styles.input}
            placeholder="Оставьте рецензию (минимум 10 символов)"
            placeholderTextColor="#8a8a8a"
            value={draft}
            onChangeText={setDraft}
            multiline
            numberOfLines={4}
          />
          <Pressable
            testID="review-submit-button"
            style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
            disabled={!canSubmit}
            onPress={() => void onSubmit()}
          >
            {createMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Добавить рецензию</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {error ? (
        <Text style={styles.error} testID="reviews-error">
          {error}
        </Text>
      ) : null}

      {reviewsQuery.isLoading ? (
        <ActivityIndicator testID="reviews-loading" style={styles.loading} />
      ) : reviews.length === 0 ? (
        <Text style={styles.empty} testID="reviews-empty">
          Пока нет ни одной рецензии.
        </Text>
      ) : (
        <View style={styles.list}>
          {reviews.map((r) => (
            <ReviewItem
              key={r.id}
              review={r}
              canDelete={user?.id === r.reviewerId || user?.role === 'ADMIN'}
              onDelete={() => void onDelete(r.id)}
              deleting={deleteMutation.isPending}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function ReviewItem({
  review,
  canDelete,
  onDelete,
  deleting,
}: {
  review: SerializedReview;
  canDelete: boolean;
  onDelete: () => void;
  deleting: boolean;
}) {
  const meta = [review.reviewerSpecialty, review.reviewerAcademicDegree, review.reviewerWorkplace]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.reviewItem} testID={`review-item-${review.id}`}>
      <View style={styles.reviewHeader}>
        <View style={styles.reviewHeaderText}>
          <Text style={styles.reviewerName}>{review.reviewerName}</Text>
          {meta ? <Text style={styles.reviewMeta}>{meta}</Text> : null}
        </View>
        {canDelete ? (
          <Pressable
            testID={`review-delete-${review.id}`}
            onPress={onDelete}
            disabled={deleting}
            style={styles.deleteButton}
          >
            <Text style={styles.deleteButtonText}>Удалить</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.reviewBody}>{review.body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  heading: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#666',
    letterSpacing: 0.5,
  },
  compose: {
    gap: 8,
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
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: '#fff',
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
  error: {
    color: '#c0392b',
    fontSize: 12,
  },
  loading: {
    marginVertical: 12,
  },
  empty: {
    fontSize: 13,
    color: '#666',
  },
  list: {
    gap: 10,
  },
  reviewItem: {
    borderWidth: 1,
    borderColor: '#e2e2e2',
    borderRadius: 10,
    padding: 12,
    gap: 6,
    backgroundColor: '#fff',
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  reviewHeaderText: {
    flex: 1,
  },
  reviewerName: {
    fontSize: 14,
    fontWeight: '600',
  },
  reviewMeta: {
    fontSize: 11,
    color: '#666',
  },
  deleteButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  deleteButtonText: {
    fontSize: 12,
    color: '#c0392b',
    fontWeight: '600',
  },
  reviewBody: {
    fontSize: 13,
    lineHeight: 18,
    color: '#333',
  },
});
