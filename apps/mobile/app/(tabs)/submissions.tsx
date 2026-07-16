import { StyleSheet, Text, View } from 'react-native';

/**
 * Placeholder — the case-submission list/create/thread flow
 * (`trpc.submissions.*`) is built in SP-4b Task 5.
 */
export default function SubmissionsScreen() {
  return (
    <View style={styles.container} testID="submissions-screen">
      <Text style={styles.title}>Мои заявки</Text>
      <Text style={styles.subtitle}>Раздел в разработке.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '600' },
  subtitle: { fontSize: 14, color: '#666' },
});
