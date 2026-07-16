import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { trpc } from '../../../src/lib/trpc';
import { submissionStatusColors, submissionStatusLabel } from '../../../src/lib/submission-status';
import { SubmissionThread } from '../../../src/components/submission-thread';
import { colors as theme } from '../../../src/theme/colors';

/**
 * Single case-submission detail, pushed from `./index.tsx`'s list.
 * `trpc.submissions.byId` takes the bare id directly (see
 * `../../../src/lib/api-types.ts`'s `RouterInputs['submissions']['byId']`),
 * resolving the full `SerializedSubmissionDetail` (title/description/status
 * plus the full `messages` thread) — `../../../src/components/submission-thread.tsx`
 * owns the thread rendering + composer + its own invalidation.
 */
export default function SubmissionDetailScreen() {
  const { t } = useTranslation();
  const { id: rawId } = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  const submissionQuery = trpc.submissions.byId.useQuery(id ?? '', { enabled: Boolean(id) });

  if (submissionQuery.isLoading) {
    return (
      <View style={styles.centered} testID="submission-detail-loading">
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (submissionQuery.isError || !submissionQuery.data) {
    return (
      <View style={styles.centered} testID="submission-detail-error">
        <Pressable testID="submission-detail-back" onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>{t('submissions.back')}</Text>
        </Pressable>
        <Text style={styles.hint}>{t('submissions.detailLoadError')}</Text>
      </View>
    );
  }

  const submission = submissionQuery.data;
  const colors = submissionStatusColors(submission.status);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      testID="submission-detail-screen"
    >
      <Pressable testID="submission-detail-back" onPress={() => router.back()} hitSlop={8}>
        <Text style={styles.back}>{t('submissions.back')}</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.title}>{submission.title}</Text>
        <View style={[styles.badge, { backgroundColor: colors.bg }]}>
          <Text style={[styles.badgeText, { color: colors.text }]}>
            {submissionStatusLabel(submission.status, t)}
          </Text>
        </View>
      </View>

      <Text style={styles.description}>{submission.description}</Text>

      <SubmissionThread submissionId={submission.id} messages={submission.messages} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: theme.background,
  },
  back: {
    fontSize: 14,
    color: theme.primary,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: theme.text,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.text,
  },
  hint: {
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
  },
});
