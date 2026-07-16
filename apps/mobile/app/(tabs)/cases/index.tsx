import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SUBGROUPS } from '../../../src/lib/taxonomy';
import { colors } from '../../../src/theme/colors';

/**
 * Subgroup picker — the "Кейсы" tab's landing screen. Static taxonomy (no
 * network call): `../../../src/lib/taxonomy.ts`'s mobile copy of the 4
 * product subgroups. Tapping one pushes `/(tabs)/cases/[subgroup]`
 * (`./[subgroup].tsx`), which does the actual `trpc.cases.listPaged` call.
 */
export default function CasesIndexScreen() {
  const { t } = useTranslation();
  return (
    <View style={styles.container} testID="cases-screen">
      <Text style={styles.title}>{t('cases.title')}</Text>
      <FlatList
        testID="subgroup-list"
        data={SUBGROUPS}
        keyExtractor={(s) => s.slug}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable
            testID={`subgroup-item-${item.slug}`}
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            onPress={() => router.push(`/(tabs)/cases/${item.slug}`)}
          >
            <Text style={styles.itemLabel}>{item.label}</Text>
          </Pressable>
        )}
      />
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
  listContent: {
    paddingBottom: 24,
    gap: 10,
  },
  item: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    marginBottom: 10,
  },
  itemPressed: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.primary,
  },
  itemLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
});
