/**
 * Integration tests for createContext — run against the real dev Postgres
 * (same harness @docjob/auth/@docjob/core use: DATABASE_URL loaded via
 * `dotenv -e ../../.env.local -e ../../.env` in this package's `test`
 * script). Each test creates its own throwaway User and cleans it up in
 * `afterEach`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { prisma, type Role } from '@docjob/db';
import { signAccessToken, type SigningKey } from '@docjob/auth';
import { createContext } from './context';

const testKey: SigningKey = { kid: 'api-context-test-kid', secret: 'api-context-test-secret-at-least-32-bytes!!' };

function uniqueEmail(tag: string): string {
  return `api-context-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
}

describe('createContext (integration, real Postgres)', () => {
  const createdUserIds: string[] = [];

  afterEach(async () => {
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }
  });

  async function makeUser(role: Role = 'DOCTOR') {
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail(role.toLowerCase()),
        passwordHash: 'unused-in-this-test',
        name: 'API Context Test User',
        role,
        approvedAt: new Date(),
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  it('resolves the actor via a DB re-read for a valid Authorization: Bearer token', async () => {
    const user = await makeUser('ADMIN');
    const token = await signAccessToken({ sub: user.id, role: user.role, approvedAt: null }, testKey);
    const req = new Request('https://example.test/api/trpc/health', {
      headers: { authorization: `Bearer ${token}` },
    });

    const ctx = await createContext({ req, keys: [testKey] });

    // approvedAt comes from the DB row, not the (deliberately different) JWT
    // claim above — proving this is a re-read, not a trust-the-token shortcut.
    expect(ctx.actor).toEqual({ id: user.id, role: 'ADMIN', approvedAt: user.approvedAt });
  });

  it('resolves the actor via the web access cookie when no bearer header is present', async () => {
    const user = await makeUser('DOCTOR');
    const token = await signAccessToken({ sub: user.id, role: user.role, approvedAt: null }, testKey);
    const req = new Request('https://example.test/api/trpc/health', {
      headers: { cookie: `some-other-cookie=x; docjob-access=${token}; another=y` },
    });

    const ctx = await createContext({ req, keys: [testKey] });

    expect(ctx.actor).toEqual({ id: user.id, role: 'DOCTOR', approvedAt: user.approvedAt });
  });

  it('also recognizes the __Host- prefixed cookie name (https/prod deployment)', async () => {
    const user = await makeUser('DOCTOR');
    const token = await signAccessToken({ sub: user.id, role: user.role, approvedAt: null }, testKey);
    const req = new Request('https://example.test/api/trpc/health', {
      headers: { cookie: `__Host-docjob-access=${token}` },
    });

    const ctx = await createContext({ req, keys: [testKey] });

    expect(ctx.actor).toEqual({ id: user.id, role: 'DOCTOR', approvedAt: user.approvedAt });
  });

  it('prefers the Authorization header over a cookie when both are present', async () => {
    const bearerUser = await makeUser('ADMIN');
    const cookieUser = await makeUser('DOCTOR');
    const bearerToken = await signAccessToken({ sub: bearerUser.id, role: bearerUser.role, approvedAt: null }, testKey);
    const cookieToken = await signAccessToken({ sub: cookieUser.id, role: cookieUser.role, approvedAt: null }, testKey);
    const req = new Request('https://example.test/api/trpc/health', {
      headers: {
        authorization: `Bearer ${bearerToken}`,
        cookie: `docjob-access=${cookieToken}`,
      },
    });

    const ctx = await createContext({ req, keys: [testKey] });

    expect(ctx.actor?.id).toBe(bearerUser.id);
  });

  it('actor is null when there is no token at all (no header, no cookie)', async () => {
    const req = new Request('https://example.test/api/trpc/health');
    const ctx = await createContext({ req, keys: [testKey] });
    expect(ctx.actor).toBeNull();
  });

  it('actor is null for a malformed/garbage bearer token', async () => {
    const req = new Request('https://example.test/api/trpc/health', {
      headers: { authorization: 'Bearer not-a-real-jwt' },
    });
    const ctx = await createContext({ req, keys: [testKey] });
    expect(ctx.actor).toBeNull();
  });

  it('actor is null when the token is validly signed but no key in the list matches', async () => {
    const user = await makeUser('DOCTOR');
    const token = await signAccessToken({ sub: user.id, role: user.role, approvedAt: null }, testKey);
    const wrongKey: SigningKey = { kid: 'other-kid', secret: 'a-completely-different-secret-32-bytes!!' };

    const req = new Request('https://example.test/api/trpc/health', {
      headers: { authorization: `Bearer ${token}` },
    });
    const ctx = await createContext({ req, keys: [wrongKey] });

    expect(ctx.actor).toBeNull();
  });

  it('actor is null when the token is valid but the user row no longer exists', async () => {
    const user = await makeUser('DOCTOR');
    const token = await signAccessToken({ sub: user.id, role: user.role, approvedAt: null }, testKey);
    // Delete the user right away — the token still verifies, but the DB
    // re-read should come back empty.
    await prisma.user.delete({ where: { id: user.id } });
    createdUserIds.length = 0; // already deleted, nothing left for afterEach to clean up

    const req = new Request('https://example.test/api/trpc/health', {
      headers: { authorization: `Bearer ${token}` },
    });
    const ctx = await createContext({ req, keys: [testKey] });

    expect(ctx.actor).toBeNull();
  });
});
