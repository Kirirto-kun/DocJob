/**
 * Integration tests for the `users` tRPC router — run against the real dev
 * Postgres (same harness cases.test.ts/submissions.test.ts use: DATABASE_URL
 * loaded via `dotenv -e ../../.env.local -e ../../.env` in this package's
 * `test` script). Exercised through `appRouter.createCaller({actor})`,
 * bypassing `createContext`'s own token verification (that's
 * context.test.ts's job).
 *
 * Note `list` is asserted as adminProcedure — it matches core's `listUsers`,
 * which calls `assertAdmin` (tightened from `assertApproved` in a
 * security-hardening pass; see user.service.ts's doc comment on `listUsers`).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TRPCError } from '@trpc/server';
import { prisma } from '@docjob/db';
import type { Actor } from '@docjob/core';
import { appRouter } from '../root';
import { createCallerFactory } from '../trpc';
import { noopEmailSender } from '../test-helpers';

const createCaller = createCallerFactory(appRouter);

function uniqueEmail(tag: string): string {
  return `api-users-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
}

async function captureTRPCError(fn: () => Promise<unknown>): Promise<TRPCError> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof TRPCError) return e;
    throw e;
  }
  throw new Error('expected a TRPCError to be thrown');
}

describe('users router (integration, real Postgres)', () => {
  let adminUserId: string;
  let adminActor: Actor;
  let doctorUserId: string;
  let doctorActor: Actor;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: uniqueEmail('admin'),
        passwordHash: 'unused-in-tests',
        name: 'API Users Test Admin',
        role: 'ADMIN',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    adminUserId = admin.id;
    adminActor = { id: admin.id, role: 'ADMIN', approvedAt: new Date() };

    const doctor = await prisma.user.create({
      data: {
        email: uniqueEmail('doctor'),
        passwordHash: 'unused-in-tests',
        name: 'API Users Test Doctor',
        role: 'DOCTOR',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    doctorUserId = doctor.id;
    doctorActor = { id: doctor.id, role: 'DOCTOR', approvedAt: new Date() };
  });

  afterAll(async () => {
    const ids = [...createdUserIds, adminUserId, doctorUserId];
    // RefreshToken cascades on User delete, but clean up explicitly first
    // in case a test issues one directly against these ids.
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  });

  // ───────────────────────── register (public)

  it('register (public caller, no actor) creates an unapproved user', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: null });
    const email = uniqueEmail('register');
    const result = await caller.users.register({
      email,
      password: 'password123',
      name: 'Newly Registered Doctor',
    });
    createdUserIds.push(result.id);

    const row = await prisma.user.findUnique({ where: { id: result.id } });
    expect(row).not.toBeNull();
    expect(row?.email).toBe(email.toLowerCase());
    expect(row?.approvedAt).toBeNull();
  });

  it('register rejects a malformed payload with TRPCError BAD_REQUEST (core ValidationError)', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: null });
    const err = await captureTRPCError(() =>
      caller.users.register({ email: 'not-an-email', password: 'x', name: '' }),
    );
    expect(err.code).toBe('BAD_REQUEST');
  });

  // ───────────────────────── me

  it('me returns the actor\'s own SerializedUser', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: doctorActor });
    const me = await caller.users.me();
    expect(me?.id).toBe(doctorUserId);
    expect(me).not.toHaveProperty('passwordHash');
  });

  it('me throws TRPCError UNAUTHORIZED for no actor', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: null });
    const err = await captureTRPCError(() => caller.users.me());
    expect(err.code).toBe('UNAUTHORIZED');
  });

  // ───────────────────────── list (adminProcedure — matches core's assertAdmin)

  it('list throws TRPCError UNAUTHORIZED for no actor', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: null });
    const err = await captureTRPCError(() => caller.users.list());
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('list rejects with TRPCError FORBIDDEN for a non-admin (approved) actor', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: doctorActor });
    const err = await captureTRPCError(() => caller.users.list());
    expect(err.code).toBe('FORBIDDEN');
  });

  it('list succeeds for an admin actor', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: adminActor });
    const list = await caller.users.list();
    expect(list.some((u) => u.id === adminUserId)).toBe(true);
  });

  // ───────────────────────── pending (adminProcedure — matches core's assertAdmin)

  it('pending rejects with TRPCError FORBIDDEN for a non-admin (approved) actor', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: doctorActor });
    const err = await captureTRPCError(() => caller.users.pending());
    expect(err.code).toBe('FORBIDDEN');
  });

  it('pending rejects with TRPCError UNAUTHORIZED for no actor', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: null });
    const err = await captureTRPCError(() => caller.users.pending());
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('pending as admin includes a freshly registered unapproved user', async () => {
    const publicCaller = createCaller({ email: noopEmailSender, actor: null });
    const email = uniqueEmail('pending');
    const registered = await publicCaller.users.register({
      email,
      password: 'password123',
      name: 'Pending Approval Doctor',
    });
    createdUserIds.push(registered.id);

    const adminCaller = createCaller({ email: noopEmailSender, actor: adminActor });
    const pending = await adminCaller.users.pending();
    expect(pending.some((u) => u.id === registered.id)).toBe(true);
  });

  // ───────────────────────── approve / reject (adminProcedure — matches core's assertAdmin)

  it('approve rejects with TRPCError FORBIDDEN for a non-admin actor', async () => {
    const publicCaller = createCaller({ email: noopEmailSender, actor: null });
    const registered = await publicCaller.users.register({
      email: uniqueEmail('approve-forbidden'),
      password: 'password123',
      name: 'Approve Forbidden Target',
    });
    createdUserIds.push(registered.id);

    const doctorCaller = createCaller({ email: noopEmailSender, actor: doctorActor });
    const err = await captureTRPCError(() => doctorCaller.users.approve(registered.id));
    expect(err.code).toBe('FORBIDDEN');
  });

  it('approve as admin sets approvedAt on the target user', async () => {
    const publicCaller = createCaller({ email: noopEmailSender, actor: null });
    const registered = await publicCaller.users.register({
      email: uniqueEmail('approve-ok'),
      password: 'password123',
      name: 'Approve OK Target',
    });
    createdUserIds.push(registered.id);

    const adminCaller = createCaller({ email: noopEmailSender, actor: adminActor });
    const result = await adminCaller.users.approve(registered.id);
    expect(result).toEqual({ id: registered.id });

    const row = await prisma.user.findUnique({ where: { id: registered.id } });
    expect(row?.approvedAt).not.toBeNull();
  });

  it('reject as admin deletes an unapproved target user', async () => {
    const publicCaller = createCaller({ email: noopEmailSender, actor: null });
    const registered = await publicCaller.users.register({
      email: uniqueEmail('reject-ok'),
      password: 'password123',
      name: 'Reject OK Target',
    });

    const adminCaller = createCaller({ email: noopEmailSender, actor: adminActor });
    const result = await adminCaller.users.reject(registered.id);
    expect(result).toEqual({ id: registered.id });

    const row = await prisma.user.findUnique({ where: { id: registered.id } });
    expect(row).toBeNull();
  });

  // ───────────────────────── updateProfile (protectedProcedure — matches core's assertApproved)

  it('updateProfile lets an actor update their own profile', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: doctorActor });
    const result = await caller.users.updateProfile({ id: doctorUserId, specialty: 'Cardiology' });
    expect(result).toEqual({ id: doctorUserId });

    const row = await prisma.user.findUnique({ where: { id: doctorUserId } });
    expect(row?.specialty).toBe('Cardiology');
  });

  it('updateProfile rejects a non-admin actor editing someone else with TRPCError FORBIDDEN (core check)', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: doctorActor });
    const err = await captureTRPCError(() =>
      caller.users.updateProfile({ id: adminUserId, specialty: 'Should not apply' }),
    );
    expect(err.code).toBe('FORBIDDEN');
  });

  it('updateProfile throws TRPCError UNAUTHORIZED for no actor', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: null });
    const err = await captureTRPCError(() => caller.users.updateProfile({ id: doctorUserId }));
    expect(err.code).toBe('UNAUTHORIZED');
  });

  // ───────────────────────── delete (adminProcedure — matches core's assertAdmin)

  it('delete rejects with TRPCError FORBIDDEN for a non-admin actor', async () => {
    const err = await captureTRPCError(() =>
      createCaller({ email: noopEmailSender, actor: doctorActor }).users.delete(adminUserId),
    );
    expect(err.code).toBe('FORBIDDEN');
  });

  it('delete as admin removes the target user', async () => {
    const publicCaller = createCaller({ email: noopEmailSender, actor: null });
    const registered = await publicCaller.users.register({
      email: uniqueEmail('delete-ok'),
      password: 'password123',
      name: 'Delete OK Target',
    });

    const adminCaller = createCaller({ email: noopEmailSender, actor: adminActor });
    const result = await adminCaller.users.delete(registered.id);
    expect(result).toEqual({ id: registered.id });

    const row = await prisma.user.findUnique({ where: { id: registered.id } });
    expect(row).toBeNull();
  });
});
