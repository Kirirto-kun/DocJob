import { StyleSheet, Text, View } from 'react-native';

/**
 * Placeholder — the AI hybrid-search tab (`trpc.search.search`) is built in
 * SP-4b Task 4.
 */
export default function SearchScreen() {
  return (
    <View style={styles.container} testID="search-screen">
      <Text style={styles.title}>Поиск</Text>
      <Text style={styles.subtitle}>Раздел в разработке.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '600' },
  subtitle: { fontSize: 14, color: '#666' },
});
