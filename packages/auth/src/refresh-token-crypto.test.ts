import { describe, it, expect } from 'vitest';
import { generateRefreshToken, hashRefreshToken } from './refresh-token-crypto';

describe('generateRefreshToken', () => {
  it('returns a high-entropy base64url string (>= 32 bytes decoded)', () => {
    const token = generateRefreshToken();
    expect(typeof token).toBe('string');
    // base64url alphabet only, no padding.
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    const decoded = Buffer.from(token, 'base64url');
    expect(decoded.length).toBeGreaterThanOrEqual(32);
  });

  it('returns a unique value on each call', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
  });
});

describe('hashRefreshToken', () => {
  it('is deterministic for the same input', () => {
    const raw = generateRefreshToken();
    expect(hashRefreshToken(raw)).toBe(hashRefreshToken(raw));
  });

  it('differs from the raw token', () => {
    const raw = generateRefreshToken();
    expect(hashRefreshToken(raw)).not.toBe(raw);
  });

  it('produces a 64-char lowercase hex sha256 digest', () => {
    const raw = generateRefreshToken();
    const hashed = hashRefreshToken(raw);
    expect(hashed).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces different hashes for different raw tokens', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(hashRefreshToken(a)).not.toBe(hashRefreshToken(b));
  });
});
