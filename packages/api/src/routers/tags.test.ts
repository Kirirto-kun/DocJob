/**
 * Integration tests for the `tags` tRPC router — run against the real dev
 * Postgres, same harness as reviews.test.ts/saved.test.ts.
 *
 * Note `add` uses `adminProcedure` at the router layer even though core's
 * `addTag` itself only requires an approved actor (see tags.ts's doc
 * comment for the deliberate-divergence rationale) — the non-admin
 * rejection test below asserts on that router-level policy, not on core.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TRPCError } from '@trpc/server';
import { prisma } from '@docjob/db';
import type { Actor } from '@docjob/core';
import { appRouter } from '../root';
import { createCallerFactory } from '../trpc';
import { noopEmailSender, testPasswordResetBase, testContactInboxEmail } from '../test-helpers';

const createCaller = createCallerFactory(appRouter);

function uniqueEmail(tag: string): string {
  return `api-tags-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
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

describe('tags router (integration, real Postgres)', () => {
  let adminUserId: string;
  let adminActor: Actor;
  let doctorUserId: string;
  let doctorActor: Actor;
  const createdLabels: string[] = [];

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: uniqueEmail('admin'),
        passwordHash: 'unused-in-tests',
        name: 'API Tags Test Admin',
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
        name: 'API Tags Test Doctor',
        role: 'DOCTOR',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    doctorUserId = doctor.id;
    doctorActor = { id: doctor.id, role: 'DOCTOR', approvedAt: new Date() };
  });

  afterAll(async () => {
    if (createdLabels.length) {
      await prisma.tag.deleteMany({ where: { label: { in: createdLabels } } });
    }
    await prisma.user.deleteMany({ where: { id: { in: [adminUserId, doctorUserId] } } });
  });

  it('add rejects with TRPCError FORBIDDEN for a non-admin (approved) actor', async () => {
    const caller = createCaller({ email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail, actor: doctorActor });
    const err = await captureTRPCError(() => caller.tags.add('should-never-be-created'));
    expect(err.code).toBe('FORBIDDEN');
  });

  it('add rejects with TRPCError UNAUTHORIZED for no actor', async () => {
    const caller = createCaller({ email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail, actor: null });
    const err = await captureTRPCError(() => caller.tags.add('should-never-be-created'));
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('list rejects with TRPCError UNAUTHORIZED for no actor', async () => {
    const caller = createCaller({ email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail, actor: null });
    const err = await captureTRPCError(() => caller.tags.list());
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('add as admin persists a trimmed label; list (any approved actor) includes it', async () => {
    const adminCaller = createCaller({ email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail, actor: adminActor });
    const label = `api-tags-trim-${Date.now()}`;
    createdLabels.push(label);

    const result = await adminCaller.tags.add(`  ${label}  `);
    expect(result).toEqual({ label });

    const doctorCaller = createCaller({ email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail, actor: doctorActor });
    const tags = await doctorCaller.tags.list();
    expect(tags).toContain(label);
  });

  it('add dedups by label: calling it twice as admin upserts, not duplicates', async () => {
    const caller = createCaller({ email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail, actor: adminActor });
    const label = `api-tags-dedup-${Date.now()}`;
    createdLabels.push(label);

    await caller.tags.add(label);
    await caller.tags.add(label);

    const rows = await prisma.tag.findMany({ where: { label } });
    expect(rows).toHaveLength(1);
  });

  it('add rejects an empty (whitespace-only) label with TRPCError BAD_REQUEST', async () => {
    const caller = createCaller({ email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail, actor: adminActor });
    const err = await captureTRPCError(() => caller.tags.add('   '));
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.message).toBe('Пустой тег.');
  });
});
