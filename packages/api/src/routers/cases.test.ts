/**
 * Integration tests for the `cases` tRPC router — run against the real dev
 * Postgres (same harness trpc.test.ts/context.test.ts use: DATABASE_URL
 * loaded via `dotenv -e ../../.env.local -e ../../.env` in this package's
 * `test` script). Exercised through a real `appRouter.createCaller({actor})`
 * — same "fake context, real DB" pattern trpc.test.ts uses (the caller is
 * built directly with an `ApiContext`, bypassing `createContext`'s own token
 * verification / DB re-read, which is `context.test.ts`'s job to cover).
 *
 * The admin actor's `id` is a REAL `User` row (not a throwaway string like
 * search.service.test.ts's fake actor) because `cases.create` persists
 * `authorId: actor.id`, which is a real FK (`Case.authorId -> User.id`,
 * `onDelete: Cascade`).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TRPCError } from '@trpc/server';
import { prisma } from '@docjob/db';
import type { Actor } from '@docjob/core';
import { appRouter } from '../root';
import { createCallerFactory } from '../trpc';

const createCaller = createCallerFactory(appRouter);

function uniqueEmail(tag: string): string {
  return `api-cases-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
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

describe('cases router (integration, real Postgres)', () => {
  let adminUserId: string;
  let adminActor: Actor;
  // Non-admin actor doesn't need to exist in the DB: adminProcedure's
  // role check rejects it before any core/DB call is made.
  const doctorActor: Actor = { id: 'not-a-real-user', role: 'DOCTOR', approvedAt: new Date() };
  const createdCaseIds: string[] = [];

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: uniqueEmail('admin'),
        passwordHash: 'unused-in-tests',
        name: 'API Cases Test Admin',
        role: 'ADMIN',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    adminUserId = admin.id;
    adminActor = { id: admin.id, role: 'ADMIN', approvedAt: new Date() };
  });

  afterAll(async () => {
    if (createdCaseIds.length) {
      await prisma.case.deleteMany({ where: { id: { in: createdCaseIds } } });
    }
    await prisma.user.delete({ where: { id: adminUserId } });
  });

  it('byId rejects with TRPCError NOT_FOUND for a missing case id', async () => {
    const caller = createCaller({ actor: adminActor });
    const err = await captureTRPCError(() => caller.cases.byId('does-not-exist'));
    expect(err.code).toBe('NOT_FOUND');
  });

  it('list throws UNAUTHORIZED for no actor (protectedProcedure gate)', async () => {
    const caller = createCaller({ actor: null });
    const err = await captureTRPCError(() => caller.cases.list({}));
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('create rejects with TRPCError FORBIDDEN for a non-admin actor', async () => {
    const caller = createCaller({ actor: doctorActor });
    const err = await captureTRPCError(() =>
      caller.cases.create({ name: 'Should never be created' }),
    );
    expect(err.code).toBe('FORBIDDEN');
  });

  it('create as admin persists and returns a SerializedCase with no solution field', async () => {
    const caller = createCaller({ actor: adminActor });
    const result = await caller.cases.create({
      name: 'API Router Test Case',
      subgroup: 'clinical',
      specialty: 'Cardiology',
    });
    createdCaseIds.push(result.id);

    expect(result.id).toBeTruthy();
    expect(result.name).toBe('API Router Test Case');
    expect(result.authorId).toBe(adminUserId);
    expect(result).not.toHaveProperty('solution');
    expect(result).not.toHaveProperty('taskQuestions');

    // Confirm it actually persisted (not just returned in-memory) via byId.
    const fetched = await caller.cases.byId(result.id);
    expect(fetched.id).toBe(result.id);
  });

  it('list({}) returns an array that includes the created case', async () => {
    const caller = createCaller({ actor: adminActor });
    const result = await caller.cases.list({});
    expect(Array.isArray(result)).toBe(true);
    expect(result.some((c) => c.id === createdCaseIds[0])).toBe(true);
  });

  it('listPaged returns a paginated page shape', async () => {
    const caller = createCaller({ actor: adminActor });
    const page = await caller.cases.listPaged({ subgroup: 'clinical', pageSize: 5 });
    expect(Array.isArray(page.items)).toBe(true);
    expect(typeof page.total).toBe('number');
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(5);
  });

  it('update as admin persists a field change', async () => {
    const caller = createCaller({ actor: adminActor });
    const updated = await caller.cases.update({ id: createdCaseIds[0], name: 'API Router Test Case (updated)' });
    expect(updated.name).toBe('API Router Test Case (updated)');

    const refetched = await caller.cases.byId(createdCaseIds[0]);
    expect(refetched.name).toBe('API Router Test Case (updated)');
  });

  it('update rejects with TRPCError FORBIDDEN for a non-admin actor', async () => {
    const caller = createCaller({ actor: doctorActor });
    const err = await captureTRPCError(() =>
      caller.cases.update({ id: createdCaseIds[0], name: 'should not apply' }),
    );
    expect(err.code).toBe('FORBIDDEN');
  });

  it('updateAttachment / deleteAttachment round-trip against a real CaseAttachment row', async () => {
    const attachment = await prisma.caseAttachment.create({
      data: {
        caseId: createdCaseIds[0],
        filename: 'api-router-test-attachment.pdf',
        originalName: 'original.pdf',
        mimeType: 'application/pdf',
        size: 123,
        kind: 'pdf',
      },
      select: { id: true },
    });

    const caller = createCaller({ actor: adminActor });
    const updated = await caller.cases.updateAttachment({ id: attachment.id, title: 'Updated title' });
    expect(updated.id).toBe(attachment.id);
    expect(updated.title).toBe('Updated title');

    const deleted = await caller.cases.deleteAttachment(attachment.id);
    expect(deleted.id).toBe(attachment.id);

    const remaining = await prisma.caseAttachment.findUnique({ where: { id: attachment.id } });
    expect(remaining).toBeNull();
  });

  it('deleteAttachment rejects with TRPCError NOT_FOUND for a missing attachment id', async () => {
    const caller = createCaller({ actor: adminActor });
    const err = await captureTRPCError(() => caller.cases.deleteAttachment('does-not-exist'));
    expect(err.code).toBe('NOT_FOUND');
  });

  it('delete removes the case; a subsequent byId then 404s', async () => {
    const caller = createCaller({ actor: adminActor });
    const id = createdCaseIds.pop()!;

    const deleted = await caller.cases.delete(id);
    expect(deleted.id).toBe(id);

    const err = await captureTRPCError(() => caller.cases.byId(id));
    expect(err.code).toBe('NOT_FOUND');
  });
});
