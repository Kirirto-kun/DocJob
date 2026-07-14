/**
 * Integration tests for submission.service — run against the real dev
 * Postgres (same harness Task 2 established: DATABASE_URL loaded via
 * `dotenv -e ../../.env.local -e ../../.env` in the package's `test`
 * script).
 *
 * NOTE (SP-1b Task 6): local Docker/Postgres is down in this environment, so
 * these tests could not be run live. They follow the exact same pattern as
 * `reviews/review.service.test.ts` (create own rows -> assert -> clean up in
 * `afterAll`) and are expected to pass once the DB is back up. Verified via
 * `pnpm --filter @docjob/core typecheck` instead (see task-6-report.md).
 *
 * Each test creates its own rows and cleans them up (create → assert →
 * delete) rather than relying on transaction rollback.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@docjob/db';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../shared/errors';
import type { Actor } from '../shared/actor';
import * as submissionService from './submission.service';

describe('submission.service (integration, real Postgres)', () => {
  let adminUserId: string;
  let adminActor: Actor;
  let authorUserId: string;
  let authorActor: Actor;
  let strangerUserId: string;
  let strangerActor: Actor;
  const createdSubmissionIds: string[] = [];

  beforeAll(async () => {
    const suffix = Date.now();
    const admin = await prisma.user.create({
      data: {
        email: `core-submission-admin-${suffix}@test.local`,
        passwordHash: 'unused-in-tests',
        name: 'Core Submission Admin',
        role: 'ADMIN',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    adminUserId = admin.id;
    adminActor = { id: admin.id, role: 'ADMIN', approvedAt: new Date() };

    const author = await prisma.user.create({
      data: {
        email: `core-submission-author-${suffix}@test.local`,
        passwordHash: 'unused-in-tests',
        name: 'Core Submission Author',
        role: 'DOCTOR',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    authorUserId = author.id;
    authorActor = { id: author.id, role: 'DOCTOR', approvedAt: new Date() };

    const stranger = await prisma.user.create({
      data: {
        email: `core-submission-stranger-${suffix}@test.local`,
        passwordHash: 'unused-in-tests',
        name: 'Core Submission Stranger',
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

  it('createCaseSubmission throws UnauthorizedError for no actor', async () => {
    await expect(
      submissionService.createCaseSubmission(null, {
        title: 'A candidate case',
        description: 'A sufficiently long description of the case.',
        authors: [],
      }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('createCaseSubmission persists, creates the opening message, and returns a SerializedCaseSubmission', async () => {
    const result = await submissionService.createCaseSubmission(authorActor, {
      title: 'A candidate case',
      description: 'A sufficiently long description of the case, for validation.',
      authors: ['Dr. Author'],
      subgroup: 'clinical',
    });
    createdSubmissionIds.push(result.id);

    expect(result.authorUserId).toBe(authorUserId);
    expect(result.title).toBe('A candidate case');
    expect(result.status).toBe('new');
    expect(result.messageCount).toBe(1);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].senderId).toBe(authorUserId);
    expect(result.messages[0].body).toBe(
      'A sufficiently long description of the case, for validation.',
    );
  });

  it('createCaseSubmission rejects a too-short title with the original Russian validation message', async () => {
    await expect(
      submissionService.createCaseSubmission(authorActor, {
        title: 'ab',
        description: 'A sufficiently long description of the case.',
        authors: [],
      }),
    ).rejects.toThrow('Название слишком короткое.');
  });

  it('getCaseSubmissionById: author can read own submission', async () => {
    const created = await submissionService.createCaseSubmission(authorActor, {
      title: 'Readable by author',
      description: 'A sufficiently long description of the case.',
      authors: [],
    });
    createdSubmissionIds.push(created.id);

    const fetched = await submissionService.getCaseSubmissionById(authorActor, created.id);
    expect(fetched.id).toBe(created.id);
  });

  it('getCaseSubmissionById: admin can read any submission', async () => {
    const created = await submissionService.createCaseSubmission(authorActor, {
      title: 'Readable by admin',
      description: 'A sufficiently long description of the case.',
      authors: [],
    });
    createdSubmissionIds.push(created.id);

    const fetched = await submissionService.getCaseSubmissionById(adminActor, created.id);
    expect(fetched.id).toBe(created.id);
  });

  it('getCaseSubmissionById: non-author non-admin gets ForbiddenError', async () => {
    const created = await submissionService.createCaseSubmission(authorActor, {
      title: 'Not readable by a stranger',
      description: 'A sufficiently long description of the case.',
      authors: [],
    });
    createdSubmissionIds.push(created.id);

    await expect(
      submissionService.getCaseSubmissionById(strangerActor, created.id),
    ).rejects.toThrow(ForbiddenError);
  });

  it('getCaseSubmissionById throws NotFoundError for a missing id', async () => {
    await expect(
      submissionService.getCaseSubmissionById(adminActor, 'does-not-exist'),
    ).rejects.toThrow(NotFoundError);
  });

  it('sendCaseSubmissionMessage: author can post, and message order is preserved', async () => {
    const created = await submissionService.createCaseSubmission(authorActor, {
      title: 'Thread order case',
      description: 'A sufficiently long description of the case.',
      authors: [],
    });
    createdSubmissionIds.push(created.id);

    const second = await submissionService.sendCaseSubmissionMessage(authorActor, {
      submissionId: created.id,
      body: 'Second message in the thread.',
    });
    const third = await submissionService.sendCaseSubmissionMessage(adminActor, {
      submissionId: created.id,
      body: 'Third message, from admin.',
    });

    expect(second.senderId).toBe(authorUserId);
    expect(third.senderId).toBe(adminUserId);

    const fetched = await submissionService.getCaseSubmissionById(authorActor, created.id);
    expect(fetched.messages.map((m) => m.body)).toEqual([
      'A sufficiently long description of the case.',
      'Second message in the thread.',
      'Third message, from admin.',
    ]);
    expect(fetched.messageCount).toBe(3);
  });

  it('sendCaseSubmissionMessage: non-author non-admin gets ForbiddenError with the original message', async () => {
    const created = await submissionService.createCaseSubmission(authorActor, {
      title: 'No stranger messages',
      description: 'A sufficiently long description of the case.',
      authors: [],
    });
    createdSubmissionIds.push(created.id);

    await expect(
      submissionService.sendCaseSubmissionMessage(strangerActor, {
        submissionId: created.id,
        body: 'I should not be able to post this.',
      }),
    ).rejects.toThrow('Недостаточно прав для отправки сообщения.');
  });

  it('sendCaseSubmissionMessage throws NotFoundError for a missing submission', async () => {
    await expect(
      submissionService.sendCaseSubmissionMessage(authorActor, {
        submissionId: 'does-not-exist',
        body: 'A message body long enough.',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('getMyCaseSubmissions returns only the caller\'s own submissions', async () => {
    const mine = await submissionService.createCaseSubmission(authorActor, {
      title: 'Mine',
      description: 'A sufficiently long description of the case.',
      authors: [],
    });
    createdSubmissionIds.push(mine.id);

    const list = await submissionService.getMyCaseSubmissions(authorActor);
    expect(list.some((s) => s.id === mine.id)).toBe(true);
    expect(list.every((s) => s.authorUserId === authorUserId)).toBe(true);

    const strangerList = await submissionService.getMyCaseSubmissions(strangerActor);
    expect(strangerList.some((s) => s.id === mine.id)).toBe(false);
  });

  it('getAllCaseSubmissions requires admin', async () => {
    await expect(submissionService.getAllCaseSubmissions(authorActor)).rejects.toThrow(
      ForbiddenError,
    );
    await expect(submissionService.getAllCaseSubmissions(null)).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it('getAllCaseSubmissions as admin sees submissions from any author', async () => {
    const created = await submissionService.createCaseSubmission(authorActor, {
      title: 'Visible to admin catalog',
      description: 'A sufficiently long description of the case.',
      authors: [],
    });
    createdSubmissionIds.push(created.id);

    const all = await submissionService.getAllCaseSubmissions(adminActor);
    expect(all.some((s) => s.id === created.id)).toBe(true);
  });

  it('updateCaseSubmissionStatus requires admin', async () => {
    const created = await submissionService.createCaseSubmission(authorActor, {
      title: 'Status change target',
      description: 'A sufficiently long description of the case.',
      authors: [],
    });
    createdSubmissionIds.push(created.id);

    await expect(
      submissionService.updateCaseSubmissionStatus(authorActor, created.id, 'accepted'),
    ).rejects.toThrow(ForbiddenError);

    const updated = await submissionService.updateCaseSubmissionStatus(
      adminActor,
      created.id,
      'accepted',
    );
    expect(updated).toEqual({ id: created.id, status: 'accepted' });

    const fetched = await submissionService.getCaseSubmissionById(adminActor, created.id);
    expect(fetched.status).toBe('accepted');
  });
});
