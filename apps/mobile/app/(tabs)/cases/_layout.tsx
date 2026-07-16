import { Stack } from 'expo-router';

/**
 * The "Кейсы" tab is itself a small nested stack (subgroup picker ->
 * per-subgroup case list), not a single screen — matches the SP-4b Task 4
 * brief's `cases/index.tsx` (picker) + `cases/[subgroup].tsx` (list) file
 * layout. `headerShown: false` everywhere, same as every other layout in
 * this app (`app/_layout.tsx`, `app/(tabs)/_layout.tsx`,
 * `app/(auth)/_layout.tsx`) — each screen renders its own in-content
 * header/back affordance instead of the native stack header.
 */
export default function CasesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
