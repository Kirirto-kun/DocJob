import { Stack } from 'expo-router';

/**
 * The "Мои заявки" tab is itself a small nested stack (submissions list +
 * create form -> single submission's thread), matching the SP-4b Task 5
 * brief's `submissions/index.tsx` + `submissions/[id].tsx` file layout —
 * same shape as `../cases/_layout.tsx`'s picker -> list stack.
 * `headerShown: false` everywhere, same as every other layout in this app —
 * each screen renders its own in-content header/back affordance instead of
 * the native stack header.
 */
export default function SubmissionsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
