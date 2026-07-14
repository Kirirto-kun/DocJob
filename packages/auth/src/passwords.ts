import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import bcrypt from 'bcryptjs';

// Legacy bcrypt hashes always start with one of these version prefixes.
const BCRYPT_PREFIX = /^\$2[aby]\$/;

/**
 * Hashes a plaintext password with argon2id (the current, non-legacy
 * algorithm for this app). `@node-rs/argon2`'s `hash()` defaults to the
 * argon2id variant.
 */
export async function hashPassword(plain: string): Promise<string> {
  return argon2Hash(plain);
}

/**
 * Verifies a plaintext password against a stored hash. Supports both the
 * current argon2id hashes and legacy bcrypt hashes (`$2a$`/`$2b$`/`$2y$`)
 * still on file for users who registered before the argon2id migration.
 */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  if (BCRYPT_PREFIX.test(hash)) {
    return bcrypt.compare(plain, hash);
  }
  return argon2Verify(hash, plain);
}

/**
 * True iff `hash` is a legacy bcrypt hash, so the login flow can transparently
 * re-hash the password to argon2id on next successful login.
 */
export function needsRehash(hash: string): boolean {
  return BCRYPT_PREFIX.test(hash);
}
