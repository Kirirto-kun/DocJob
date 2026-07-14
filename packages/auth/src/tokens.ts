import { randomBytes, createHash } from 'node:crypto';
import { SignJWT, jwtVerify, decodeProtectedHeader } from 'jose';
import type { Role } from '@docjob/db';

/** Default access-token lifetime: 15 minutes. */
const DEFAULT_TTL_SECONDS = 900;

/** Claims carried by the short-lived access JWT. */
export type AccessClaims = { sub: string; role: Role; approvedAt: string | null };

/**
 * A single HS256 signing/verification key. `kid` is stamped into the JWT
 * header so `verifyAccessToken` can pick the matching secret out of a list —
 * this is what lets the signing secret rotate without invalidating every
 * access token already in flight (old tokens keep verifying against the
 * previous key until they naturally expire).
 */
export interface SigningKey {
  kid: string;
  secret: string;
}

function encodeSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/**
 * Signs a short-lived access JWT (HS256) carrying `sub`/`role`/`approvedAt`.
 * The JWT header's `kid` is set to `key.kid` so verifiers can select the
 * correct secret out of a multi-key list (see `verifyAccessToken`).
 */
export async function signAccessToken(
  claims: AccessClaims,
  key: SigningKey,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: claims.role, approvedAt: claims.approvedAt })
    .setProtectedHeader({ alg: 'HS256', kid: key.kid })
    .setSubject(claims.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(encodeSecret(key.secret));
}

/**
 * Verifies an access JWT against a list of candidate keys. Tries the key
 * whose `kid` matches the token's header first; if there's no match (or the
 * header can't be read), falls back to trying every supplied key so a
 * missing/garbled `kid` can't lock out an otherwise-valid rotation window.
 * Never throws — any failure (bad signature, expired, malformed, tampered)
 * resolves to `null`.
 */
export async function verifyAccessToken(token: string, keys: SigningKey[]): Promise<AccessClaims | null> {
  let orderedKeys: SigningKey[] = keys;
  try {
    const header = decodeProtectedHeader(token);
    if (header.kid) {
      const match = keys.filter((k) => k.kid === header.kid);
      const rest = keys.filter((k) => k.kid !== header.kid);
      orderedKeys = [...match, ...rest];
    }
  } catch {
    // Malformed header — fall through and just try every key as-is.
  }

  for (const key of orderedKeys) {
    try {
      const { payload } = await jwtVerify(token, encodeSecret(key.secret));
      if (typeof payload.sub !== 'string') continue;
      const role = payload.role as Role | undefined;
      if (role === undefined) continue;
      const approvedAt = (payload.approvedAt as string | null | undefined) ?? null;
      return { sub: payload.sub, role, approvedAt };
    } catch {
      // Wrong key / expired / tampered — try the next key.
      continue;
    }
  }
  return null;
}

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
