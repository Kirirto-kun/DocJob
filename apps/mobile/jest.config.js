/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest-setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
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
