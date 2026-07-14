/**
 * Integration tests for the `submissions` tRPC router — run against the real
 * dev Postgres (same harness cases.test.ts/reviews.test.ts use: DATABASE_URL
 * loaded via `dotenv -e ../../.env.local -e ../../.env` in this package's
 * `test` script). Exercised through `appRouter.createCaller({actor})`,
 * bypassing `createContext`'s own token verification (that's
 * context.test.ts's job).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TRPCError } from '@trpc/server';
import { prisma } from '@docjob/db';
import type { Actor } from '@docjob/core';
import { appRouter } from '../root';
import { createCallerFactory } from '../trpc';

const createCaller = createCallerFactory(appRouter);

function uniqueEmail(tag: string): string {
  return `api-submissions-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
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

describe('submissions router (integration, real Postgres)', () => {
  let adminUserId: string;
  let adminActor: Actor;
  let authorUserId: string;
  let authorActor: Actor;
  let strangerUserId: string;
  let strangerActor: Actor;
  const createdSubmissionIds: string[] = [];

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: uniqueEmail('admin'),
        passwordHash: 'unused-in-tests',
        name: 'API Submissions Test Admin',
        role: 'ADMIN',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    adminUserId = admin.id;
    adminActor = { id: admin.id, role: 'ADMIN', approvedAt: new Date() };

    const author = await prisma.user.create({
      data: {
        email: uniqueEmail('author'),
        passwordHash: 'unused-in-tests',
        name: 'API Submissions Test Author',
        role: 'DOCTOR',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    authorUserId = author.id;
    authorActor = { id: author.id, role: 'DOCTOR', approvedAt: new Date() };

    const stranger = await prisma.user.create({
      data: {
        email: uniqueEmail('stranger'),
        passwordHash: 'unused-in-tests',
        name: 'API Submissions Test Stranger',
        role: 'DOCTOR',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    strangerUserId = stranger.id;
    strangerActor = { id: stranger.id, role: 'DOCTOR', approvedAt: new Date() };
  });

  afterAll(async () => {
    if (createdSubmissionIds.length) {
      await prisma.caseSubmission.deleteMany({ where: { id: { in: createdSubmissionIds } } });
    }
    await prisma.user.deleteMany({
      where: { id: { in: [adminUserId, authorUserId, strangerUserId] } },
    });
  });

  it('create rejects with TRPCError UNAUTHORIZED for no actor', async () => {
    const caller = createCaller({ actor: null });
    const err = await captureTRPCError(() =>
      caller.submissions.create({
        title: 'Should never be created',
        description: 'A sufficiently long description of the case.',
        authors: [],
      }),
    );
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('create as an approved actor persists and returns a SerializedCaseSubmission', async () => {
    const caller = createCaller({ actor: authorActor });
    const result = await caller.submissions.create({
      title: 'A candidate case',
      description: 'A sufficiently long description of the case, for validation.',
      authors: ['Dr. Author'],
      subgroup: 'clinical',
    });
    createdSubmissionIds.push(result.id);

    expect(result.id).toBeTruthy();
    expect(result.authorUserId).toBe(authorUserId);
    expect(result.title).toBe('A candidate case');
    expect(result.status).toBe('new');
    expect(result.messageCount).toBe(1);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].body).toBe(
      'A sufficiently long description of the case, for validation.',
    );
  });

  it('create rejects a too-short title with TRPCError BAD_REQUEST (core ValidationError)', async () => {
    const caller = createCaller({ actor: authorActor });
    const err = await captureTRPCError(() =>
      caller.submissions.create({ title: 'ab', description: 'A sufficiently long description.', authors: [] }),
    );
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.message).toBe('Название слишком короткое.');
  });

  it('byId: author can read their own submission', async () => {
    const caller = createCaller({ actor: authorActor });
    const created = await caller.submissions.create({
      title: 'Readable by author',
      description: 'A sufficiently long description of the case.',
      authors: [],
    });
    createdSubmissionIds.push(created.id);

    const fetched = await caller.submissions.byId(created.id);
    expect(fetched.id).toBe(created.id);
  });

  it('byId: admin can read any submission', async () => {
    const authorCaller = createCaller({ actor: authorActor });
    const created = await authorCaller.submissions.create({
      title: 'Readable by admin',
      description: 'A sufficiently long description of the case.',
      authors: [],
    });
    createdSubmissionIds.push(created.id);

    const adminCaller = createCaller({ actor: adminActor });
    const fetched = await adminCaller.submissions.byId(created.id);
    expect(fetched.id).toBe(created.id);
  });

  it('byId: a non-author non-admin actor is rejected with TRPCError FORBIDDEN', async () => {
    const authorCaller = createCaller({ actor: authorActor });
    const created = await authorCaller.submissions.create({
      title: 'Not readable by a stranger',
      description: 'A sufficiently long description of the case.',
      authors: [],
    });
    createdSubmissionIds.push(created.id);

    const strangerCaller = createCaller({ actor: strangerActor });
    const err = await captureTRPCError(() => strangerCaller.submissions.byId(created.id));
    expect(err.code).toBe('FORBIDDEN');
  });

  it('byId throws TRPCError NOT_FOUND for a missing id', async () => {
    const caller = createCaller({ actor: adminActor });
    const err = await captureTRPCError(() => caller.submissions.byId('does-not-exist'));
    expect(err.code).toBe('NOT_FOUND');
  });

  it('byId throws TRPCError UNAUTHORIZED for no actor', async () => {
    const caller = createCaller({ actor: null });
    const err = await captureTRPCError(() => caller.submissions.byId('does-not-exist'));
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('sendMessage appends a message and preserves thread order', async () => {
    const authorCaller = createCaller({ actor: authorActor });
    const created = await authorCaller.submissions.create({
      title: 'Thread order case',
      description: 'A sufficiently long description of the case.',
      authors: [],
    });
    createdSubmissionIds.push(created.id);

    const second = await authorCaller.submissions.sendMessage({
      submissionId: created.id,
      body: 'Second message in the thread.',
    });
    const adminCaller = createCaller({ actor: adminActor });
    const third = await adminCaller.submissions.sendMessage({
      submissionId: created.id,
      body: 'Third message, from admin.',
    });

    expect(second.senderId).toBe(authorUserId);
    expect(third.senderId).toBe(adminUserId);

    const fetched = await authorCaller.submissions.byId(created.id);
    expect(fetched.messages.map((m) => m.body)).toEqual([
      'A sufficiently long description of the case.',
      'Second message in the thread.',
      'Third message, from admin.',
    ]);
    expect(fetched.messageCount).toBe(3);
  });

  it('sendMessage: a non-author non-admin actor is rejected with TRPCError FORBIDDEN', async () => {
    const authorCaller = createCaller({ actor: authorActor });
    const created = await authorCaller.submissions.create({
      title: 'No stranger messages',
      description: 'A sufficiently long description of the case.',
      authors: [],
    });
    createdSubmissionIds.push(created.id);

    const strangerCaller = createCaller({ actor: strangerActor });
    const err = await captureTRPCError(() =>
      strangerCaller.submissions.sendMessage({
        submissionId: created.id,
        body: 'I should not be able to post this.',
      }),
    );
    expect(err.code).toBe('FORBIDDEN');
  });

  it("mine returns only the caller's own submissions", async () => {
    const authorCaller = createCaller({ actor: authorActor });
    const mine = await authorCaller.submissions.create({
      title: 'Mine',
      description: 'A sufficiently long description of the case.',
      authors: [],
    });
    createdSubmissionIds.push(mine.id);

    const list = await authorCaller.submissions.mine();
    expect(list.some((s) => s.id === mine.id)).toBe(true);
    expect(list.every((s) => s.authorUserId === authorUserId)).toBe(true);

    const strangerCaller = createCaller({ actor: strangerActor });
    const strangerList = await strangerCaller.submissions.mine();
    expect(strangerList.some((s) => s.id === mine.id)).toBe(false);
  });

  it('all rejects with TRPCError FORBIDDEN for a non-admin actor', async () => {
    const caller = createCaller({ actor: authorActor });
    const err = await captureTRPCError(() => caller.submissions.all());
    expect(err.code).toBe('FORBIDDEN');
  });

  it('all rejects with TRPCError UNAUTHORIZED for no actor', async () => {
    const caller = createCaller({ actor: null });
    const err = await captureTRPCError(() => caller.submissions.all());
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('all as admin sees submissions from any author', async () => {
    const authorCaller = createCaller({ actor: authorActor });
    const created = await authorCaller.submissions.create({
      title: 'Visible to admin catalog',
      description: 'A sufficiently long description of the case.',
      authors: [],
    });
    createdSubmissionIds.push(created.id);

    const adminCaller = createCaller({ actor: adminActor });
    const all = await adminCaller.submissions.all();
    expect(all.some((s) => s.id === created.id)).toBe(true);
  });

  it('updateStatus rejects with TRPCError FORBIDDEN for a non-admin actor', async () => {
    const authorCaller = createCaller({ actor: authorActor });
    const created = await authorCaller.submissions.create({
      title: 'Status change target',
      description: 'A sufficiently long description of the case.',
      authors: [],
    });
    createdSubmissionIds.push(created.id);

    const err = await captureTRPCError(() =>
      authorCaller.submissions.updateStatus({ submissionId: created.id, status: 'accepted' }),
    );
    expect(err.code).toBe('FORBIDDEN');
  });

  it('updateStatus as admin updates the status', async () => {
    const authorCaller = createCaller({ actor: authorActor });
    const created = await authorCaller.submissions.create({
      title: 'Status change target (admin)',
      description: 'A sufficiently long description of the case.',
      authors: [],
    });
    createdSubmissionIds.push(created.id);

    const adminCaller = createCaller({ actor: adminActor });
    const updated = await adminCaller.submissions.updateStatus({
      submissionId: created.id,
      status: 'accepted',
    });
    expect(updated).toEqual({ id: created.id, status: 'accepted' });

    const fetched = await adminCaller.submissions.byId(created.id);
    expect(fetched.status).toBe('accepted');
  });
});
