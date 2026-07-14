/**
 * Integration tests for user.service — run against the real dev Postgres
 * (same harness Task 2 established: DATABASE_URL loaded via
 * `dotenv -e ../../.env.local -e ../../.env` in the package's `test` script).
 *
 * Each test creates its own rows and cleans them up (create → assert →
 * delete) rather than relying on transaction rollback, since user.service's
 * functions each open/commit their own Prisma calls.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { verifyPassword } from '@docjob/auth';
import { prisma } from '@docjob/db';
import { ForbiddenError, UnauthorizedError } from '../shared/errors';
import type { Actor } from '../shared/actor';
import * as userService from './user.service';

describe('user.service (integration, real Postgres)', () => {
  let adminUserId: string;
  let adminActor: Actor;
  const nonAdminActor: Actor = { id: 'not-a-real-user', role: 'DOCTOR', approvedAt: new Date() };
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: `core-user-service-admin-${Date.now()}@test.local`,
        passwordHash: 'unused-in-tests',
        name: 'Core Test Admin',
        role: 'ADMIN',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    adminUserId = admin.id;
    adminActor = { id: admin.id, role: 'ADMIN', approvedAt: new Date() };
  });

  afterAll(async () => {
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.user.delete({ where: { id: adminUserId } });
  });

  it('registerUser creates an unapproved user (approvedAt=null) with an argon2id-hashed password', async () => {
    const email = `core-register-${Date.now()}@test.local`;
    const { id } = await userService.registerUser({
      email,
      password: 'secret123',
      name: 'New Doctor',
    });
    createdUserIds.push(id);

    const row = await prisma.user.findUnique({ where: { id } });
    expect(row).not.toBeNull();
    expect(row!.email).toBe(email.toLowerCase());
    expect(row!.approvedAt).toBeNull();
    expect(row!.role).toBe('DOCTOR');
    // Password is hashed (argon2id, via @docjob/auth's hashPassword), never
    // stored in plaintext.
    expect(row!.passwordHash).not.toBe('secret123');
    expect(row!.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(row!.passwordHash, 'secret123')).toBe(true);
  });

  it('registerUser rejects a duplicate email (ConflictError → Russian message)', async () => {
    const email = `core-dup-${Date.now()}@test.local`;
    const first = await userService.registerUser({ email, password: 'secret123', name: 'First' });
    createdUserIds.push(first.id);

    await expect(
      userService.registerUser({ email, password: 'secret123', name: 'Second' }),
    ).rejects.toThrow('Пользователь с такой почтой уже существует.');
  });

  it('approveUser throws ForbiddenError for a non-admin actor', async () => {
    await expect(userService.approveUser(nonAdminActor, 'any-id')).rejects.toThrow(ForbiddenError);
  });

  it('approveUser throws UnauthorizedError when there is no actor', async () => {
    await expect(userService.approveUser(null, 'any-id')).rejects.toThrow(UnauthorizedError);
  });

  it('approveUser as admin sets approvedAt on a pending user', async () => {
    const { id } = await userService.registerUser({
      email: `core-approve-${Date.now()}@test.local`,
      password: 'secret123',
      name: 'Pending Doctor',
    });
    createdUserIds.push(id);

    const result = await userService.approveUser(adminActor, id);
    expect(result.id).toBe(id);

    const row = await prisma.user.findUnique({ where: { id } });
    expect(row!.approvedAt).not.toBeNull();
  });

  it('requestPasswordReset returns null neutrally for an unknown email (anti-enumeration)', async () => {
    const result = await userService.requestPasswordReset(`no-such-user-${Date.now()}@test.local`);
    expect(result).toBeNull();
  });

  it('requestPasswordReset returns null for a malformed email', async () => {
    expect(await userService.requestPasswordReset('not-an-email')).toBeNull();
  });
});
