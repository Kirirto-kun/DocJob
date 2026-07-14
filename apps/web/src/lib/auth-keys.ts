import type { SigningKey } from '@docjob/auth';

/**
 * The key currently used to *sign* new access tokens. Only ever `kid:
 * 'current'` — signing never needs the previous secret, only verification
 * does (see `verificationKeys` below).
 */
export function signingKey(): SigningKey {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not configured');
  return { kid: 'current', secret };
}

/**
 * Every key `verifyAccessToken` should try, newest first. Carrying
 * `AUTH_SECRET_PREVIOUS` alongside `AUTH_SECRET` lets a secret rotation
 * happen without instantly invalidating every access token already handed
 * out (they keep verifying against the previous key until they naturally
 * expire, ~15m later) — see `packages/auth/src/tokens.ts`'s
 * `verifyAccessToken` for the `kid`-based key selection this feeds.
 */
export function verificationKeys(): SigningKey[] {
  const keys = [signingKey()];
  if (process.env.AUTH_SECRET_PREVIOUS) {
    keys.push({ kid: 'previous', secret: process.env.AUTH_SECRET_PREVIOUS });
  }
  return keys;
}
