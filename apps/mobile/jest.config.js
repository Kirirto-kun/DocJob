/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest-setup.ts'],
  // GitHub Actions runs every workspace test task concurrently through
  // Turbo. Keep mobile on one Jest worker there so React Native renders do
  // not lose their entire 5s default timeout to CPU contention. Local runs
  // can still use half of the available cores.
  maxWorkers: process.env.CI ? 1 : '50%',
  testTimeout: 15_000,
  transformIgnorePatterns: [
    // `standard-navigation` added on top of jest-expo's default list: it's a
    // transitive dependency `expo-router` itself needs once code actually
    // imports router primitives beyond the bare `Stack` (T1's scaffold never
    // exercised this path) — `Redirect`, `Tabs`, `Stack.Protected`, etc.
    // (T3). Its `main` entry ships un-transpiled ESM (`import`/`export`),
    // so without this it fails with "Cannot use import statement outside a
    // module" the first time anything in the mobile app imports from
    // `expo-router` beyond the trivial root `Stack`.
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|standard-navigation)',
  ],
  // This monorepo's pnpm hoisting mixes a React 18 web app (apps/web) with
  // this React 19 RN app in the SAME hoisted node_modules root (see
  // .npmrc's node-linker=hoisted). Root's single hoisted `react` therefore
  // resolves to 18.x, which `test-renderer`/@testing-library's internal
  // `require('react')` picks up instead of the 19.x this app actually uses
  // (symptom: "act" warnings + "render function has not been called").
  // Force every `react`/JSX-runtime resolution inside Jest to this app's own
  // node_modules/react (19.x) regardless of where in node_modules the
  // requiring package physically lives.
  moduleNameMapper: {
    '^react-native-vector-icons$': '@expo/vector-icons',
    '^react-native-vector-icons/(.*)': '@expo/vector-icons/$1',
    '^react$': require.resolve('react'),
    '^react/jsx-runtime$': require.resolve('react/jsx-runtime'),
    '^react/jsx-dev-runtime$': require.resolve('react/jsx-dev-runtime'),
  },
};
