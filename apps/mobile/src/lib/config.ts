import Constants from 'expo-constants';

/**
 * Base URL every `/api/...` call (REST auth endpoints + the tRPC batch
 * link) is prefixed with. Resolution order:
 *
 *  1. `app.json`'s `expo.extra.apiUrl` (read via `expo-constants` — this is
 *     how EAS build profiles will pin a per-environment URL at build time,
 *     see SP-4b Task 6's EAS config).
 *  2. `process.env.EXPO_PUBLIC_API_URL` (Expo's `EXPO_PUBLIC_`-prefixed env
 *     vars are inlined into the JS bundle by Metro at build time, so this
 *     works the same way in dev and in a built app).
 *  3. `http://localhost:3000` — the Next.js dev server default (`pnpm dev`
 *     in `apps/web`), for local development against a simulator/emulator
 *     with no other config present.
 *
 * Resolved once at module load (not read on every call) since none of these
 * sources change at runtime.
 */
function resolveApiBaseUrl(): string {
  const extra = Constants.expoConfig?.extra as { apiUrl?: unknown } | undefined;
  if (typeof extra?.apiUrl === 'string' && extra.apiUrl.length > 0) {
    return extra.apiUrl;
  }

  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (typeof envUrl === 'string' && envUrl.length > 0) {
    return envUrl;
  }

  return 'http://localhost:3000';
}

export const API_BASE_URL = resolveApiBaseUrl();
