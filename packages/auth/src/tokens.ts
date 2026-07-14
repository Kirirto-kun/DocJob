// Deliberately importing jose's granular JWS-only subpaths (`jose/jwt/sign`,
// `jose/jwt/verify`, `jose/decode/protected_header`) instead of the `jose`
// barrel. The barrel's index also re-exports the JWE (encryption) code path,
// whose deflate support (`jose/dist/webapi/lib/deflate.js`) references
// `CompressionStream`/`DecompressionStream` — APIs Next.js's Edge Runtime
// build flags as unsupported. This app only ever signs/verifies (JWS), never
// encrypts, so the granular imports avoid dragging that unused code (and the
// build warning it causes) into `apps/web/src/middleware.ts`'s Edge bundle.
import { SignJWT } from 'jose/jwt/sign';
import { jwtVerify } from 'jose/jwt/verify';
import { decodeProtectedHeader } from 'jose/decode/protected_header';
import type { Role } from '@docjob/db';

// Also deliberately NOT importing `node:crypto` (or anything else Node-only)
// in this file: `signAccessToken`/`verifyAccessToken` below must stay
// Edge-safe, because `apps/web/src/middleware.ts` imports `verifyAccessToken`
// straight from the `@docjob/auth/tokens` subpath (never the package's `.`
// barrel — that barrel also re-exports `login.service.ts` and
// `refresh.service.ts`, which pull in Prisma and the native
// `@node-rs/argon2` binding, neither of which can be bundled for the Edge
// runtime). The opaque-refresh-token helpers that DO need `node:crypto`
// (`generateRefreshToken`/`hashRefreshToken`) live in
// `refresh-token-crypto.ts` instead, specifically so importing them here
// couldn't accidentally drag `node:crypto` into this Edge-safe module.

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

// `generateRefreshToken`/`hashRefreshToken` moved to `refresh-token-crypto.ts`
// (node:crypto-based) — see the file-header comment above for why.
