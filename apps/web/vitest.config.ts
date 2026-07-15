import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Mirrors tsconfig.json's `@/*` -> `./src/*` path alias (see that file's
  // `compilerOptions.paths`). Needed as of SP-4a T5's `auth-mobile.test.ts`,
  // which imports the auth route handlers directly — those routes import
  // `@/lib/*` internally, and vitest doesn't read tsconfig `paths` on its
  // own the way Next.js's own bundler does.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
