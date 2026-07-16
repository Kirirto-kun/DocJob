import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { SearchHit } from '../lib/api-types';
import { stripSnippetHtml } from '../lib/html-text';

type SearchResultCardProps = {
  hit: SearchHit;
  onPress: () => void;
};

/**
 * One `SearchHit` in the AI search results list (`app/(tabs)/search.tsx`).
 * `hit.matchedVia` ('semantic' | 'lexical', see
 * `packages/core/src/search/fusion.ts`) renders as small "why matched"
 * badges, mirroring `apps/web/src/app/ai-search/page.tsx`'s
 * `matchedSemantic`/`matchedLexical` badges. `hit.snippet` is server HTML
 * (`<mark>` only) — rendered as plain text via `stripSnippetHtml`, NOT a
 * webview (see that helper's doc comment).
 */
export function SearchResultCard({ hit, onPress }: SearchResultCardProps) {
  const { t } = useTranslation();
  const c = hit.case;
  const isSemantic = hit.matchedVia.includes('semantic');
  const isLexical = hit.matchedVia.includes('lexical');
  const snippet = hit.snippet ? stripSnippetHtml(hit.snippet) : null;

  const subtitleParts = [c.specialty, c.primaryCondition].filter((v): v is string => Boolean(v));

  return (
    <Pressable
      testID={`search-result-card-${c.id}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <Text style={styles.title}>{c.name}</Text>
      {subtitleParts.length > 0 ? (
        <Text style={styles.subtitle}>{subtitleParts.join(' · ')}</Text>
      ) : null}

      {isSemantic || isLexical ? (
        <View style={styles.badgeRow}>
          {isSemantic ? (
            <View testID="badge-semantic" style={styles.badge}>
              <Text style={styles.badgeText}>{t('search.badgeSemantic')}</Text>
            </View>
          ) : null}
          {isLexical ? (
            <View testID="badge-lexical" style={styles.badge}>
              <Text style={styles.badgeText}>{t('search.badgeLexical')}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {snippet ? (
        <Text testID="search-result-snippet" style={styles.snippet} numberOfLines={3}>
          {snippet}
        </Text>
      ) : c.teaser ? (
        <Text style={styles.snippet} numberOfLines={2}>
          {c.teaser}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 12,
    color: '#666',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  badge: {
    backgroundColor: '#eef2ff',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563eb',
  },
  snippet: {
    fontSize: 13,
    color: '#444',
    lineHeight: 18,
  },
});
