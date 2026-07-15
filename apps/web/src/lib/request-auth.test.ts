/**
 * Integration tests for `getUserFromRequest` (`./session`) — run against the
 * real dev Postgres, same harness `packages/api/src/context.test.ts` uses
 * (`DATABASE_URL` loaded via `dotenv -e ../../.env.local -e ../../.env` in
 * this package's `test` script). Each test creates its own throwaway User
 * and cleans it up in `afterEach`.
 *
 * `getUserFromRequest` mirrors `packages/api/src/context.ts`'s token
 * extraction (Bearer header first, falling back to the access cookie) so a
 * mobile client hitting a plain REST route handler (no cookies at all, just
 * `Authorization: Bearer <jwt>`) authenticates identically to one calling
 * through the tRPC endpoint.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { prisma, type Role } from '@docjob/db';
import { signAccessToken } from '@docjob/auth';
import { getUserFromRequest } from './session';
import { signingKey } from './auth-keys';

function uniqueEmail(tag: string): string {
  return `request-auth-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
}

describe('getUserFromRequest (integration, real Postgres)', () => {
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
        name: 'Request Auth Test User',
        role,
        approvedAt: new Date(),
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  it('resolves the user from an Authorization: Bearer header (mobile client, no cookies)', async () => {
    const user = await makeUser('DOCTOR');
    const token = await signAccessToken({ sub: user.id, role: user.role, approvedAt: null }, signingKey());
    const req = new Request('https://example.test/api/attachments/foo.pdf', {
      headers: { authorization: `Bearer ${token}` },
    });

    const resolved = await getUserFromRequest(req);

    expect(resolved?.id).toBe(user.id);
    // approvedAt comes from the DB row, not the (deliberately different) JWT
    // claim above — proving this is a re-read, not a trust-the-token shortcut.
    expect(resolved?.approvedAt).toEqual(user.approvedAt);
  });

  it('resolves the user from the access cookie when no bearer header is present (web client)', async () => {
    const user = await makeUser('ADMIN');
    const token = await signAccessToken({ sub: user.id, role: user.role, approvedAt: null }, signingKey());
    const req = new Request('https://example.test/api/attachments/foo.pdf', {
      headers: { cookie: `some-other-cookie=x; docjob-access=${token}; another=y` },
    });

    const resolved = await getUserFromRequest(req);

    expect(resolved?.id).toBe(user.id);
  });

  it('also recognizes the __Host- prefixed cookie name (https/prod deployment)', async () => {
    const user = await makeUser('DOCTOR');
    const token = await signAccessToken({ sub: user.id, role: user.role, approvedAt: null }, signingKey());
    const req = new Request('https://example.test/api/attachments/foo.pdf', {
      headers: { cookie: `__Host-docjob-access=${token}` },
    });

    const resolved = await getUserFromRequest(req);

    expect(resolved?.id).toBe(user.id);
  });

  it('prefers the Authorization header over a cookie when both are present', async () => {
    const bearerUser = await makeUser('ADMIN');
    const cookieUser = await makeUser('DOCTOR');
    const bearerToken = await signAccessToken({ sub: bearerUser.id, role: bearerUser.role, approvedAt: null }, signingKey());
    const cookieToken = await signAccessToken({ sub: cookieUser.id, role: cookieUser.role, approvedAt: null }, signingKey());
    const req = new Request('https://example.test/api/attachments/foo.pdf', {
      headers: {
        authorization: `Bearer ${bearerToken}`,
        cookie: `docjob-access=${cookieToken}`,
      },
    });

    const resolved = await getUserFromRequest(req);

    expect(resolved?.id).toBe(bearerUser.id);
  });

  it('resolves to null when there is no auth at all (no header, no cookie)', async () => {
    const req = new Request('https://example.test/api/attachments/foo.pdf');
    const resolved = await getUserFromRequest(req);
    expect(resolved).toBeNull();
  });

  it('resolves to null for a garbage/malformed bearer token', async () => {
    const req = new Request('https://example.test/api/attachments/foo.pdf', {
      headers: { authorization: 'Bearer not-a-real-jwt' },
    });
    const resolved = await getUserFromRequest(req);
    expect(resolved).toBeNull();
  });

  it('resolves to null for an expired token', async () => {
    const user = await makeUser('DOCTOR');
    const token = await signAccessToken({ sub: user.id, role: user.role, approvedAt: null }, signingKey(), -10);
    const req = new Request('https://example.test/api/attachments/foo.pdf', {
      headers: { authorization: `Bearer ${token}` },
    });

    const resolved = await getUserFromRequest(req);

    expect(resolved).toBeNull();
  });

  it('resolves to null when the token is valid but the user row no longer exists', async () => {
    const user = await makeUser('DOCTOR');
    const token = await signAccessToken({ sub: user.id, role: user.role, approvedAt: null }, signingKey());
    await prisma.user.delete({ where: { id: user.id } });
    createdUserIds.length = 0; // already deleted, nothing left for afterEach to clean up

    const req = new Request('https://example.test/api/attachments/foo.pdf', {
      headers: { authorization: `Bearer ${token}` },
    });

    const resolved = await getUserFromRequest(req);

    expect(resolved).toBeNull();
  });
});
