import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { trpc } from '../../../src/lib/trpc';
import { subgroupLabel } from '../../../src/lib/taxonomy';
import { CaseCard } from '../../../src/components/case-card';

// Comfortably above any real subgroup's case count for this product
// (a curated case library, not a mass catalog) — a single page keeps this
// screen simple (plain `useQuery`, no cursor/page-accumulation state) while
// still going through the real `listPaged` procedure and `CaseListItem`
// wire type. `listPaged`'s own cap is 100 (`packages/core/src/cases/case.service.ts`).
const PAGE_SIZE = 100;

/** Per-subgroup case list, reached from `./index.tsx`'s picker. */
export default function CasesBySubgroupScreen() {
  const { subgroup: rawSubgroup } = useLocalSearchParams<{ subgroup: string | string[] }>();
  const subgroup = Array.isArray(rawSubgroup) ? rawSubgroup[0] : rawSubgroup;

  const casesQuery = trpc.cases.listPaged.useQuery({
    subgroup,
    page: 1,
    pageSize: PAGE_SIZE,
  });

  const items = casesQuery.data?.items ?? [];

  return (
    <View style={styles.container} testID="cases-list-screen">
      <View style={styles.header}>
        <Pressable testID="cases-back" onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>{'‹ Кейсы'}</Text>
        </Pressable>
        <Text style={styles.title}>{subgroupLabel(subgroup)}</Text>
      </View>

      {casesQuery.isLoading ? (
        <View style={styles.centered} testID="cases-list-loading">
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : casesQuery.isError ? (
        <View style={styles.centered} testID="cases-list-error">
          <Text style={styles.hint}>Не удалось загрузить кейсы. Попробуйте ещё раз.</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered} testID="cases-list-empty">
          <Text style={styles.hint}>В этой подгруппе пока нет кейсов.</Text>
        </View>
      ) : (
        <FlatList
          testID="cases-list"
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <CaseCard item={item} onPress={() => router.push(`/case/${item.id}`)} />
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
});
