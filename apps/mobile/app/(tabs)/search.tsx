import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { trpc } from '../../src/lib/trpc';
import { SearchResultCard } from '../../src/components/search-result-card';
import { Banner } from '../../src/components/banner';
import { colors } from '../../src/theme/colors';

/**
 * AI hybrid-search tab (SP-4b Task 4). `trpc.search.search` wraps
 * `core.search.searchCases` (`packages/core/src/search/search.service.ts`):
 * a lexical (Russian FTS + trigram) arm fused with a semantic (pgvector KNN
 * over an LLM-refined query) arm, boosted by intent overlap, degrading to a
 * substring fallback. The query only fires once the user submits (there is
 * no as-you-type debounce — every keystroke would otherwise risk tripping
 * the router's own 30-req/60s rate limit, and each call can trigger an
 * OpenAI round-trip server-side, so "submit" is a deliberate choice over
 * "debounce", see the Task 4 report).
 *
 * `enabled: hasQuery` (`../../src/lib/api-types.ts`'s `SearchHit[]`) means
 * the query never runs for an empty/unsubmitted screen — that's the
 * `'initial'` state below, distinct from `'loading'` (query in flight) and
 * a `[]` result (`'empty'`).
 *
 * Rate limiting: the router throws a tRPC `TOO_MANY_REQUESTS` error whose
 * `message` already carries the Russian retry-after copy
 * (`packages/api/src/routers/search.ts`); this reads `error.data?.code`
 * (the server error shape tRPC attaches to every `TRPCClientError`) to
 * render that message in its own distinct banner rather than the generic
 * error state.
 *
 * `<Banner />` (SP-4b Task 5, `../../src/components/banner.tsx`) is mounted
 * at the top — this is the tab a user lands on immediately after login
 * (`app/index.tsx`'s `'authenticated'` redirect target), so it's the most
 * visible "sensible" placement per that task's brief. Renders nothing when
 * the admin-uploaded banner manifest has no active slots.
 */
export default function SearchScreen() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const hasQuery = submittedQuery.trim().length > 0;

  const searchQuery = trpc.search.search.useQuery(
    { query: submittedQuery },
    { enabled: hasQuery },
  );

  const onSubmit = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSubmittedQuery(trimmed);
  };

  const isRateLimited = searchQuery.isError && searchQuery.error?.data?.code === 'TOO_MANY_REQUESTS';
  const results = searchQuery.data ?? [];

  return (
    <View style={styles.container} testID="search-screen">
      <Banner />
      <Text style={styles.title}>{t('search.title')}</Text>

      <View style={styles.searchRow}>
        <TextInput
          testID="search-input"
          style={styles.input}
          placeholder={t('search.placeholder')}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={onSubmit}
          returnKeyType="search"
        />
        <Pressable
          testID="search-submit"
          style={[styles.submitButton, !query.trim() && styles.submitButtonDisabled]}
          onPress={onSubmit}
          disabled={!query.trim()}
        >
          <Text style={styles.submitButtonText}>{t('search.submit')}</Text>
        </Pressable>
      </View>

      {!hasQuery ? (
        <View style={styles.centered} testID="search-initial">
          <Text style={styles.hint}>{t('search.initialHint')}</Text>
        </View>
      ) : isRateLimited ? (
        <View style={styles.centered} testID="search-rate-limited">
          <Text style={styles.errorText}>
            {searchQuery.error?.message || t('search.rateLimitFallback')}
          </Text>
        </View>
      ) : searchQuery.isLoading ? (
        <View style={styles.centered} testID="search-loading">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : searchQuery.isError ? (
        <View style={styles.centered} testID="search-error">
          <Text style={styles.errorText}>{t('search.errorFallback')}</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.centered} testID="search-empty">
          <Text style={styles.hint}>{t('search.emptyResult', { query: submittedQuery })}</Text>
        </View>
      ) : (
        <FlatList
          testID="search-results-list"
          data={results}
          keyExtractor={(hit) => hit.case.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <SearchResultCard hit={item} onPress={() => router.push(`/case/${item.case.id}`)} />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: colors.surfaceElevated,
    color: colors.text,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: colors.onPrimary,
    fontWeight: '600',
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
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorText: {
    fontSize: 14,
    color: colors.danger,
    textAlign: 'center',
    lineHeight: 20,
  },
  listContent: {
    paddingBottom: 24,
  },
});
