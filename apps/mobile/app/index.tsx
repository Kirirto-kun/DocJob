import { StyleSheet, Text, View } from 'react-native';

/**
 * Trivial placeholder screen for SP-4b Task 1 (the scaffold/feasibility
 * gate). Real screens (auth stack, tabs, search, cases, ...) land in
 * subsequent SP-4b tasks (see .superpowers/sdd/task-1-brief.md and the
 * sibling task briefs).
 */
export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>DocJob Mobile</Text>
      <Text style={styles.subtitle}>Scaffold OK — screens land in later SP-4b tasks.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
});
