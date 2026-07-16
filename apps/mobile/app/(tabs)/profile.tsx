import { StyleSheet, Text, View } from 'react-native';

/**
 * Placeholder — profile edit + logout + language toggle (`trpc.users.me`/
 * `updateProfile`, `useSession().logout`) is built in SP-4b Task 5.
 */
export default function ProfileScreen() {
  return (
    <View style={styles.container} testID="profile-screen">
      <Text style={styles.title}>Профиль</Text>
      <Text style={styles.subtitle}>Раздел в разработке.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '600' },
  subtitle: { fontSize: 14, color: '#666' },
});
