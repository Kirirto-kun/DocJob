import { describe, it, expect } from 'vitest';
import { signAccessToken, verifyAccessToken, type AccessClaims, type SigningKey } from './tokens';

const currentKey: SigningKey = { kid: 'k1', secret: 'current-secret-at-least-32-bytes-long!!' };
const previousKey: SigningKey = { kid: 'k0', secret: 'previous-secret-at-least-32-bytes-long!' };
const wrongKey: SigningKey = { kid: 'k1', secret: 'wrong-secret-but-same-kid-32-bytes-long!' };

const claims: AccessClaims = { sub: 'user-123', role: 'DOCTOR', approvedAt: '2026-01-01T00:00:00.000Z' };

describe('signAccessToken / verifyAccessToken', () => {
  it('round-trips claims (sub, role, approvedAt) through sign then verify', async () => {
    const token = await signAccessToken(claims, currentKey);
    const result = await verifyAccessToken(token, [currentKey]);
    expect(result).toEqual(claims);
  });

  it('round-trips a null approvedAt', async () => {
    const unapproved: AccessClaims = { sub: 'user-456', role: 'PATIENT' as AccessClaims['role'], approvedAt: null };
    const token = await signAccessToken(unapproved, currentKey);
    const result = await verifyAccessToken(token, [currentKey]);
    expect(result).toEqual(unapproved);
  });

  it('verifies when the signing key is present anywhere in the key list', async () => {
    const token = await signAccessToken(claims, currentKey);
    const result = await verifyAccessToken(token, [previousKey, currentKey]);
    expect(result).toEqual(claims);
  });

  it('fails when the key list only contains a different secret under the same kid', async () => {
    const token = await signAccessToken(claims, currentKey);
    const result = await verifyAccessToken(token, [wrongKey]);
    expect(result).toBeNull();
  });

  it('fails when the key list does not contain the signing kid at all', async () => {
    const token = await signAccessToken(claims, currentKey);
    const result = await verifyAccessToken(token, [previousKey]);
    expect(result).toBeNull();
  });

  it('keyed rotation: a token signed with the previous key still verifies when both previous and current keys are supplied', async () => {
    const token = await signAccessToken(claims, previousKey);
    const result = await verifyAccessToken(token, [currentKey, previousKey]);
    expect(result).toEqual(claims);
  });

  it('returns null for an expired token (negative ttl)', async () => {
    const token = await signAccessToken(claims, currentKey, -10);
    const result = await verifyAccessToken(token, [currentKey]);
    expect(result).toBeNull();
  });

  it('returns null for an expired token (tiny ttl, after waiting)', async () => {
    const token = await signAccessToken(claims, currentKey, 1);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const result = await verifyAccessToken(token, [currentKey]);
    expect(result).toBeNull();
  }, 10000);

  it('returns null for a tampered token (payload mutated)', async () => {
    const token = await signAccessToken(claims, currentKey);
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
    // Flip a character in the payload segment to corrupt the signature.
    const payload = parts[1];
    const flipped = payload.slice(0, -1) + (payload.at(-1) === 'A' ? 'B' : 'A');
    const tampered = [parts[0], flipped, parts[2]].join('.');
    const result = await verifyAccessToken(tampered, [currentKey]);
    expect(result).toBeNull();
  });

  it('returns null for a garbage/malformed token', async () => {
    const result = await verifyAccessToken('not-a-jwt-at-all', [currentKey]);
    expect(result).toBeNull();
  });

  it('defaults ttl to 900 seconds (15 minutes) when omitted', async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await signAccessToken(claims, currentKey);
    const [, payloadB64] = token.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as { exp: number };
    // Allow a couple seconds of slack for test execution time.
    expect(payload.exp).toBeGreaterThanOrEqual(before + 900 - 2);
    expect(payload.exp).toBeLessThanOrEqual(before + 900 + 2);
  });
});
