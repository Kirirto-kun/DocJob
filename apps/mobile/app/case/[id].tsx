import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { trpc } from '../../src/lib/trpc';
import { subgroupLabel } from '../../src/lib/taxonomy';
import { CaseBodyWebView } from '../../src/components/case-body-webview';
import { ReviewsPanel } from '../../src/components/reviews-panel';
import { SaveButton } from '../../src/components/save-button';
import { colors } from '../../src/theme/colors';

/**
 * Case detail — a pushed route (NOT a tab), reached from a search hit
 * (`app/(tabs)/search.tsx`) or a case card
 * (`app/(tabs)/cases/[subgroup].tsx`). `trpc.cases.byId` takes the bare id
 * string directly (see `../../src/lib/api-types.ts`'s
 * `RouterInputs['cases']['byId']`, not `{ id }`) and resolves the FULL
 * `SerializedCase` (unlike the list procedures' lighter `CaseListItem`),
 * including `bodyHtml` — rendered via `CaseBodyWebView`.
 *
 * Composition: `SaveButton`/`ReviewsPanel` are self-contained (own their own
 * queries/mutations/invalidation, see their own doc comments) and only need
 * `caseId` from here.
 */
export default function CaseDetailScreen() {
  const { t } = useTranslation();
  const { id: rawId } = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  const caseQuery = trpc.cases.byId.useQuery(id ?? '', { enabled: Boolean(id) });

  if (caseQuery.isLoading) {
    return (
      <View style={styles.centered} testID="case-detail-loading">
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (caseQuery.isError || !caseQuery.data) {
    return (
      <View style={styles.centered} testID="case-detail-error">
        <Pressable testID="case-detail-back" onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>{t('caseDetail.back')}</Text>
        </Pressable>
        <Text style={styles.hint}>{t('caseDetail.loadError')}</Text>
      </View>
    );
  }

  const c = caseQuery.data;
  const headerMeta = [c.age != null ? t('caseDetail.ageYears', { age: c.age }) : null, c.gender].filter(
    (v): v is string => Boolean(v),
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      testID="case-detail-screen"
    >
      <Pressable testID="case-detail-back" onPress={() => router.back()} hitSlop={8}>
        <Text style={styles.back}>{t('caseDetail.back')}</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.title}>{c.name}</Text>
        {headerMeta.length > 0 ? <Text style={styles.meta}>{headerMeta.join(' · ')}</Text> : null}

        <View style={styles.badgeRow}>
          {c.specialty ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{c.specialty}</Text>
            </View>
          ) : null}
          {c.subgroup ? (
            <View style={[styles.badge, styles.badgeOutline]}>
              <Text style={styles.badgeText}>{subgroupLabel(c.subgroup)}</Text>
            </View>
          ) : null}
        </View>

        <SaveButton caseId={c.id} />
      </View>

      <CaseBodyWebView html={c.bodyHtml} />

      <ReviewsPanel caseId={c.id} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 4,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: colors.background,
  },
  back: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
    marginBottom: 8,
  },
  header: {
    gap: 10,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  meta: {
    fontSize: 13,
    color: colors.textMuted,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeOutline: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  hint: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
