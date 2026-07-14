import { randomBytes, createHash } from 'node:crypto';

// Split out of tokens.ts (SP-1c Task 6) so that file can stay jose-only and
// Edge-safe — `apps/web/src/middleware.ts` imports `verifyAccessToken` via
// the `@docjob/auth/tokens` subpath specifically to avoid pulling
// `node:crypto` (unsupported in the Edge runtime) into the middleware
// bundle. These two functions are Node-only and are only ever used from
// Node-runtime routes (`refresh.service.ts`, the login/refresh/logout API
// routes), never from middleware.

/**
 * A fresh, high-entropy opaque refresh token (32 bytes, base64url-encoded) —
 * the raw value handed to the client. Mirrors `generateResetToken` in
 * @docjob/core's password-reset-tokens.ts, but base64url (more compact in a
 * cookie) rather than hex.
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 hex digest of the raw refresh token. Only this hash is stored. */
export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
