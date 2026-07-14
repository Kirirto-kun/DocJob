import { randomUUID } from 'node:crypto';
import { prisma } from '@docjob/db';
import { generateRefreshToken, hashRefreshToken } from './refresh-token-crypto';

/** Refresh-token family lifetime: 60 days. */
const REFRESH_TTL_MS = 60 * 24 * 60 * 60 * 1000;

/** Default reuse-detection grace window: 10 seconds. */
const DEFAULT_GRACE_SECONDS = 10;

/**
 * Result of a `rotateRefresh` call:
 * - `{ ok: true, ... }` — rotation succeeded; `newRaw` is the fresh opaque
 *   refresh token to hand back to the client.
 * - `{ revoked: true }` — the presented token had already been rotated or
 *   revoked and the reuse fell outside the grace window (or had no live
 *   child to fall back to) — the entire family has been revoked.
 * - `null` — the token is unknown or expired.
 */
export type RotateResult =
  | { ok: true; userId: string; familyId: string; newRaw: string; expiresAt: Date }
  | { revoked: true }
  | null;

/**
 * Starts a new refresh-token family for `userId`: mints a fresh opaque raw
 * token, stores only its SHA-256 hash, and returns the raw value once (it is
 * never persisted or retrievable again). Every later rotation in this family
 * shares the returned `familyId`.
 */
export async function issueRefreshFamily(
  userId: string,
  deviceLabel?: string,
): Promise<{ raw: string; expiresAt: Date; familyId: string }> {
  const familyId = randomUUID();
  const raw = generateRefreshToken();
  const tokenHash = hashRefreshToken(raw);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

  await prisma.refreshToken.create({
    data: { userId, familyId, tokenHash, expiresAt, deviceLabel },
  });

  return { raw, expiresAt, familyId };
}

/**
 * Rotates a refresh token: exchanges a still-live, unrotated raw token for a
 * new one in the same family.
 *
 * Reuse detection: if the presented raw token has already been rotated
 * (`rotatedToId` set) or revoked (`revokedAt` set), that is a signal the
 * token leaked and is being replayed — normally the entire family is
 * revoked immediately (`{ revoked: true }`).
 *
 * Grace window: a client can legitimately resubmit the same old raw token
 * a second time in quick succession (e.g. its first rotation response was
 * lost to a network error and it retried). To avoid punishing that with a
 * forced logout, a reuse that (a) followed a genuine rotation
 * (`rotatedToId` is set) and (b) lands within `graceSeconds` of that
 * rotation's `replacedAt` is treated as benign: the already-rotated-to
 * child token slot is re-armed with a freshly generated raw value (the
 * original raw handed out for that child is unrecoverable — only its hash
 * is ever stored — so an identical byte-for-byte token cannot be
 * reissued) and returned as `{ ok: true, ... }` without touching
 * `revokedAt` anywhere in the family. Outside the grace window, or when
 * there is no live child to fall back to, the safe default is to revoke
 * the whole family.
 */
export async function rotateRefresh(
  rawToken: string,
  graceSeconds: number = DEFAULT_GRACE_SECONDS,
): Promise<RotateResult> {
  const tokenHash = hashRefreshToken(rawToken);
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!row) return null;

  const now = new Date();
  if (row.expiresAt < now) return null;

  if (row.rotatedToId || row.revokedAt) {
    // Already rotated or revoked — this presentation is a reuse. Check the
    // grace window before falling back to full-family revocation.
    if (row.rotatedToId && row.replacedAt) {
      const elapsedMs = now.getTime() - row.replacedAt.getTime();
      if (elapsedMs >= 0 && elapsedMs <= graceSeconds * 1000) {
        const child = await prisma.refreshToken.findUnique({ where: { id: row.rotatedToId } });
        if (child && !child.revokedAt && child.expiresAt > now) {
          const newRaw = generateRefreshToken();
          const newHash = hashRefreshToken(newRaw);
          const updated = await prisma.refreshToken.update({
            where: { id: child.id },
            data: { tokenHash: newHash },
          });
          return { ok: true, userId: row.userId, familyId: row.familyId, newRaw, expiresAt: updated.expiresAt };
        }
        // Child is missing/revoked/expired — fall through to a full revoke
        // (safest default when the grace-window fallback isn't usable).
      }
    }
    await revokeFamily(row.familyId, 'reuse-detected');
    return { revoked: true };
  }

  // Valid, unrotated token: rotate it.
  const newRaw = generateRefreshToken();
  const newHash = hashRefreshToken(newRaw);
  const expiresAt = new Date(now.getTime() + REFRESH_TTL_MS);

  const child = await prisma.$transaction(async (tx) => {
    const created = await tx.refreshToken.create({
      data: {
        userId: row.userId,
        familyId: row.familyId,
        tokenHash: newHash,
        expiresAt,
        deviceLabel: row.deviceLabel,
      },
    });
    await tx.refreshToken.update({
      where: { id: row.id },
      data: { rotatedToId: created.id, replacedAt: now },
    });
    return created;
  });

  return { ok: true, userId: row.userId, familyId: row.familyId, newRaw, expiresAt: child.expiresAt };
}

/** Revokes every currently-active row in a family (idempotent). */
export async function revokeFamily(familyId: string, reason: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date(), revokeReason: reason },
  });
}

/** Revokes every currently-active refresh-token row for a user, across all families ("log out everywhere"). */
export async function revokeAllForUser(userId: string, reason: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokeReason: reason },
  });
}
