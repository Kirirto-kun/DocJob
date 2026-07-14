import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { hashPassword, verifyPassword, needsRehash } from './passwords';

describe('hashPassword', () => {
  it('returns an argon2id hash string, not the plaintext', async () => {
    const hash = await hashPassword('secret');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toBe('secret');
  });
});

describe('verifyPassword', () => {
  it('returns true for the right plaintext against an argon2id hash', async () => {
    const hash = await hashPassword('secret');
    await expect(verifyPassword(hash, 'secret')).resolves.toBe(true);
  });

  it('returns false for the wrong plaintext against an argon2id hash', async () => {
    const hash = await hashPassword('secret');
    await expect(verifyPassword(hash, 'wrong')).resolves.toBe(false);
  });

  it('verifies a legacy bcrypt hash correctly', async () => {
    const bcryptHash = bcrypt.hashSync('secret', 10);
    await expect(verifyPassword(bcryptHash, 'secret')).resolves.toBe(true);
    await expect(verifyPassword(bcryptHash, 'wrong')).resolves.toBe(false);
  });
});

describe('needsRehash', () => {
  it('is true for a legacy bcrypt hash', () => {
    const bcryptHash = bcrypt.hashSync('secret', 10);
    expect(needsRehash(bcryptHash)).toBe(true);
  });

  it('is false for an argon2id hash', async () => {
    const hash = await hashPassword('secret');
    expect(needsRehash(hash)).toBe(false);
  });
});
