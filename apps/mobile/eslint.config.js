// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // RN-bundle boundary guard (see CLAUDE.md's "THE #1 RISK" note for
    // SP-4b): @docjob/core/db/auth are server-only packages that would
    // poison the React Native bundle if a value (or even type) import ever
    // slipped in. Derive wire types via inferRouterOutputs<AppRouter>
    // instead (see src/lib/api-types.ts). `no-restricted-imports` can't
    // distinguish a type-only import of @docjob/api from a value import —
    // that half of the guard is enforced mechanically by
    // src/__tests__/boundary.test.ts instead.
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: '@docjob/core', message: 'Server-only; would poison the RN bundle. Derive types via inferRouterOutputs<AppRouter>.' },
          { name: '@docjob/db', message: 'Server-only; never import in mobile.' },
          { name: '@docjob/auth', message: 'Server-only; never import in mobile.' },
        ],
        patterns: [
          { group: ['@docjob/core/*', '@docjob/db/*', '@docjob/auth/*'], message: 'Server-only; never import in mobile.' },
        ],
      }],
    },
  },
]);
