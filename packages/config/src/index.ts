import { z } from 'zod';

// SP-5 T4: opt-in Redis client (getRedis() -> Redis | null), shared by the
// Redis-backed rate-limiter/query-cache adapters in @docjob/auth, @docjob/api,
// @docjob/core.
export * from './redis';

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
