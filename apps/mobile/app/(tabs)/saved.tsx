import { StyleSheet, Text, View } from 'react-native';

/**
 * Placeholder — the bookmarked-cases list (`trpc.saved.list`) is built in
 * SP-4b Task 5.
 */
export default function SavedScreen() {
  return (
    <View style={styles.container} testID="saved-screen">
      <Text style={styles.title}>Сохранённые</Text>
      <Text style={styles.subtitle}>Раздел в разработке.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '600' },
  subtitle: { fontSize: 14, color: '#666' },
});
