import { describe, it, expect } from 'vitest';
import {
  generateResetToken,
  hashResetToken,
  resetTokenExpiry,
  isResetTokenExpired,
  isResetTokenUsable,
  isWithinResendCooldown,
  RESET_TOKEN_TTL_MS,
  RESET_TOKEN_RESEND_COOLDOWN_MS,
} from './password-reset-tokens';

describe('generateResetToken', () => {
  it('returns a 64-char hex string', () => {
    expect(generateResetToken()).toMatch(/^[0-9a-f]{64}$/);
  });
  it('returns a different value each call', () => {
    expect(generateResetToken()).not.toBe(generateResetToken());
  });
});

describe('hashResetToken', () => {
  it('is deterministic for the same input', () => {
    expect(hashResetToken('abc')).toBe(hashResetToken('abc'));
  });
  it('differs for different inputs', () => {
    expect(hashResetToken('abc')).not.toBe(hashResetToken('abd'));
  });
  it('does not return the raw token', () => {
    expect(hashResetToken('abc')).not.toBe('abc');
  });
});

describe('expiry', () => {
  const now = new Date('2026-06-16T12:00:00Z');
  it('resetTokenExpiry is TTL after now', () => {
    expect(resetTokenExpiry(now).getTime()).toBe(now.getTime() + RESET_TOKEN_TTL_MS);
  });
  it('not expired before TTL elapses', () => {
    const exp = resetTokenExpiry(now);
    const later = new Date(now.getTime() + RESET_TOKEN_TTL_MS - 1000);
    expect(isResetTokenExpired(exp, later)).toBe(false);
  });
  it('expired once TTL passes', () => {
    const exp = resetTokenExpiry(now);
    const later = new Date(now.getTime() + RESET_TOKEN_TTL_MS + 1000);
    expect(isResetTokenExpired(exp, later)).toBe(true);
  });
});

describe('isResetTokenUsable', () => {
  const now = new Date('2026-06-16T12:00:00Z');
  const future = new Date(now.getTime() + 1000);
  const past = new Date(now.getTime() - 1000);
  it('usable when unused and not expired', () => {
    expect(isResetTokenUsable({ usedAt: null, expiresAt: future }, now)).toBe(true);
  });
  it('not usable when already used', () => {
    expect(isResetTokenUsable({ usedAt: now, expiresAt: future }, now)).toBe(false);
  });
  it('not usable when expired', () => {
    expect(isResetTokenUsable({ usedAt: null, expiresAt: past }, now)).toBe(false);
  });
});

describe('isWithinResendCooldown', () => {
  const now = new Date('2026-06-16T12:00:00Z');
  it('true just after creation', () => {
    expect(isWithinResendCooldown(now, now)).toBe(true);
  });
  it('false after cooldown elapses', () => {
    const before = new Date(now.getTime() - RESET_TOKEN_RESEND_COOLDOWN_MS - 1);
    expect(isWithinResendCooldown(before, now)).toBe(false);
  });
});
