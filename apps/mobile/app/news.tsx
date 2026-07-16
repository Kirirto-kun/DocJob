import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { trpc } from '../src/lib/trpc';
import type { SerializedNewsItem } from '../src/lib/api-types';

/**
 * Public news list — a pushed route (not a tab), reachable from
 * `app/(tabs)/profile.tsx`'s "Новости" entry. `trpc.news.list` is a
 * `publicProcedure` (`packages/api/src/routers/news.ts`'s `listPublicNews`,
 * no actor needed), so this screen could in principle also be reached
 * pre-login — it isn't linked from the `(auth)` stack yet, but nothing about
 * the query itself requires a session.
 */
export default function NewsScreen() {
  const newsQuery = trpc.news.list.useQuery();
  const items = newsQuery.data ?? [];

  return (
    <View style={styles.container} testID="news-screen">
      <View style={styles.header}>
        <Pressable testID="news-back" onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>{'‹ Назад'}</Text>
        </Pressable>
        <Text style={styles.title}>Новости</Text>
      </View>

      {newsQuery.isLoading ? (
        <View style={styles.centered} testID="news-loading">
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : newsQuery.isError ? (
        <View style={styles.centered} testID="news-error">
          <Text style={styles.hint}>Не удалось загрузить новости. Попробуйте ещё раз.</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered} testID="news-empty">
          <Text style={styles.hint}>Пока нет новостей.</Text>
        </View>
      ) : (
        <FlatList
          testID="news-list"
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => <NewsItemCard item={item} />}
        />
      )}
    </View>
  );
}

function NewsItemCard({ item }: { item: SerializedNewsItem }) {
  const parsed = new Date(item.date);
  const dateLabel = Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString('ru-RU');

  return (
    <View style={styles.card} testID={`news-item-${item.id}`}>
      <Text style={styles.cardTitle}>{item.title}</Text>
      {dateLabel ? <Text style={styles.cardDate}>{dateLabel}</Text> : null}
      <Text style={styles.cardBody} numberOfLines={6}>
        {item.body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  header: {
    gap: 4,
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
  listContent: {
    paddingBottom: 24,
  },
  card: {
    borderWidth: 1,
    borderColor: '#e2e2e2',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    backgroundColor: '#fff',
    gap: 6,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  cardDate: {
    fontSize: 12,
    color: '#999',
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 18,
    color: '#444',
  },
});
