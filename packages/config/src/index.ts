import { z } from 'zod';

// Central env validation. Extend as packages/core lands (SP-1).
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Custom JWT auth (@docjob/auth) — signing/verification secret and the
  // canonical app URL (also used as the CSRF same-origin allowlist, see
  // apps/web/src/lib/csrf.ts). AUTH_SECRET_PREVIOUS is optional and only
  // needed during a secret rotation window (see apps/web/src/lib/auth-keys.ts).
  AUTH_SECRET: z.string().min(1),
  AUTH_URL: z.string().url(),
  AUTH_SECRET_PREVIOUS: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
