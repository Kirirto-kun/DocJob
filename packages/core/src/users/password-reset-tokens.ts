/**
 * Moved verbatim from apps/web/src/lib/password-reset-tokens.ts (SP-1b Task 3).
 * Pure token helpers — no framework/transport dependency — so they live in
 * @docjob/core alongside the user.service that uses them. The web app's
 * `@/lib/password-reset-tokens` now just re-exports these names so existing
 * imports (and its test file) keep working unchanged.
 */
import { randomBytes, createHash } from 'node:crypto';

/** Reset links live for 1 hour. */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/** Don't send more than one reset email per minute per user. */
export const RESET_TOKEN_RESEND_COOLDOWN_MS = 60 * 1000;

/** A fresh, high-entropy reset token — the raw value emailed to the user. */
export function generateResetToken(): string {
  return randomBytes(32).toString('hex');
}

/** SHA-256 of the raw token. Only this hash is stored in the database. */
export function hashResetToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Expiry timestamp for a token created at `now`. */
export function resetTokenExpiry(now: Date): Date {
  return new Date(now.getTime() + RESET_TOKEN_TTL_MS);
}

/** True if `expiresAt` is at or before `now`. */
export function isResetTokenExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/** A token is usable only if it has not been used and has not expired. */
export function isResetTokenUsable(
  token: { usedAt: Date | null; expiresAt: Date },
  now: Date,
): boolean {
  if (token.usedAt !== null) return false;
  return !isResetTokenExpired(token.expiresAt, now);
}

/** True if the previous token was created too recently to send another email. */
export function isWithinResendCooldown(lastCreatedAt: Date, now: Date): boolean {
  return now.getTime() - lastCreatedAt.getTime() < RESET_TOKEN_RESEND_COOLDOWN_MS;
}
