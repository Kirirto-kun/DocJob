import { StyleSheet, Text, View } from 'react-native';

/**
 * Placeholder — the subgroup picker + case list (`trpc.cases.listPaged`)
 * is built in SP-4b Task 4.
 */
export default function CasesScreen() {
  return (
    <View style={styles.container} testID="cases-screen">
      <Text style={styles.title}>Кейсы</Text>
      <Text style={styles.subtitle}>Раздел в разработке.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '600' },
  subtitle: { fontSize: 14, color: '#666' },
});
