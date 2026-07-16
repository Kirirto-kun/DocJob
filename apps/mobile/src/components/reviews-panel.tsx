import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { useSession } from '../providers/session';
import type { SerializedReview } from '../lib/api-types';
import { colors } from '../theme/colors';

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
  const { t } = useTranslation();
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
      setError(e instanceof Error ? e.message : t('reviews.addErrorFallback'));
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
      setError(e instanceof Error ? e.message : t('reviews.deleteErrorFallback'));
    }
  };

  return (
    <View style={styles.container} testID="reviews-panel">
      <Text style={styles.heading}>{t('reviews.heading')}</Text>

      {canWrite ? (
        <View style={styles.compose} testID="reviews-compose">
          <TextInput
            testID="review-draft-input"
            style={styles.input}
            placeholder={t('reviews.placeholder')}
            placeholderTextColor={colors.textMuted}
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
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <Text style={styles.submitButtonText}>{t('reviews.submit')}</Text>
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
          {t('reviews.empty')}
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
  const { t } = useTranslation();
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
            <Text style={styles.deleteButtonText}>{t('reviews.delete')}</Text>
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
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  compose: {
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: colors.surface,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: colors.surfaceElevated,
    color: colors.text,
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
  error: {
    color: colors.danger,
    fontSize: 12,
  },
  loading: {
    marginVertical: 12,
  },
  empty: {
    fontSize: 13,
    color: colors.textMuted,
  },
  list: {
    gap: 10,
  },
  reviewItem: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    gap: 6,
    backgroundColor: colors.surface,
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
    color: colors.text,
  },
  reviewMeta: {
    fontSize: 11,
    color: colors.textMuted,
  },
  deleteButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  deleteButtonText: {
    fontSize: 12,
    color: colors.danger,
    fontWeight: '600',
  },
  reviewBody: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
  },
});
