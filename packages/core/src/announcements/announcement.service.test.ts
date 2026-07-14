/**
 * Integration tests for announcement.service — run against the real dev
 * Postgres (same harness Task 2 established).
 *
 * NOTE (SP-1b Task 7): local Docker/Postgres is down in this environment, so
 * these tests could not be run live. They follow the exact same pattern as
 * `submissions/submission.service.test.ts` (create own rows -> assert ->
 * clean up in `afterAll`) and are expected to pass once the DB is back up.
 * Verified via `pnpm --filter @docjob/core typecheck` instead.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@docjob/db';
import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../shared/errors';
import type { Actor } from '../shared/actor';
import * as announcementService from './announcement.service';

describe('announcement.service (integration, real Postgres)', () => {
  let adminUserId: string;
  let adminActor: Actor;
  let doctorUserId: string;
  let doctorActor: Actor;
  const createdAnnouncementIds: string[] = [];

  beforeAll(async () => {
    const suffix = Date.now();
    const admin = await prisma.user.create({
      data: {
        email: `core-announcement-admin-${suffix}@test.local`,
        passwordHash: 'unused-in-tests',
        name: 'Core Announcement Admin',
        role: 'ADMIN',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    adminUserId = admin.id;
    adminActor = { id: admin.id, role: 'ADMIN', approvedAt: new Date() };

    const doctor = await prisma.user.create({
      data: {
        email: `core-announcement-doctor-${suffix}@test.local`,
        passwordHash: 'unused-in-tests',
        name: 'Core Announcement Doctor',
        role: 'DOCTOR',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    doctorUserId = doctor.id;
    doctorActor = { id: doctor.id, role: 'DOCTOR', approvedAt: new Date() };
  });

  afterAll(async () => {
    if (createdAnnouncementIds.length) {
      await prisma.announcementDismissal.deleteMany({
        where: { announcementId: { in: createdAnnouncementIds } },
      });
      await prisma.announcement.deleteMany({ where: { id: { in: createdAnnouncementIds } } });
    }
    await prisma.user.deleteMany({ where: { id: { in: [adminUserId, doctorUserId] } } });
  });

  it('createAnnouncement throws UnauthorizedError for no actor', async () => {
    await expect(
      announcementService.createAnnouncement(null, { title: 'T', body: 'B' }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('createAnnouncement throws ForbiddenError for a non-admin actor', async () => {
    await expect(
      announcementService.createAnnouncement(doctorActor, { title: 'T', body: 'B' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('createAnnouncement rejects an invalid linkUrl', async () => {
    await expect(
      announcementService.createAnnouncement(adminActor, {
        title: 'T',
        body: 'B',
        linkUrl: 'not a url',
      }),
    ).rejects.toThrow('Некорректная ссылка.');
  });

  it('createAnnouncement persists an active announcement by default', async () => {
    const created = await announcementService.createAnnouncement(adminActor, {
      title: 'Active by default',
      body: 'Body',
    });
    createdAnnouncementIds.push(created.id);
    expect(created.active).toBe(true);
    expect(created.expiresAt).toBeNull();
  });

  it('getActiveAnnouncements returns [] for a null actor (guest), not an error', async () => {
    const result = await announcementService.getActiveAnnouncements(null);
    expect(result).toEqual([]);
  });

  it('getActiveAnnouncements includes an active, non-expired announcement for a logged-in doctor', async () => {
    const created = await announcementService.createAnnouncement(adminActor, {
      title: 'Visible to doctor',
      body: 'Body',
    });
    createdAnnouncementIds.push(created.id);

    const result = await announcementService.getActiveAnnouncements(doctorActor);
    expect(result.some((a) => a.id === created.id)).toBe(true);
  });

  it('getActiveAnnouncements excludes an inactive announcement', async () => {
    const created = await announcementService.createAnnouncement(adminActor, {
      title: 'Inactive',
      body: 'Body',
      active: false,
    });
    createdAnnouncementIds.push(created.id);

    const result = await announcementService.getActiveAnnouncements(doctorActor);
    expect(result.some((a) => a.id === created.id)).toBe(false);
  });

  it('getActiveAnnouncements excludes an expired announcement', async () => {
    const created = await announcementService.createAnnouncement(adminActor, {
      title: 'Expired',
      body: 'Body',
      expiresAt: new Date(Date.now() - 1000 * 60).toISOString(),
    });
    createdAnnouncementIds.push(created.id);

    const result = await announcementService.getActiveAnnouncements(doctorActor);
    expect(result.some((a) => a.id === created.id)).toBe(false);
  });

  it('getActiveAnnouncements excludes an announcement the actor already dismissed', async () => {
    const created = await announcementService.createAnnouncement(adminActor, {
      title: 'Dismiss me',
      body: 'Body',
    });
    createdAnnouncementIds.push(created.id);

    await announcementService.dismissAnnouncement(doctorActor, created.id);

    const result = await announcementService.getActiveAnnouncements(doctorActor);
    expect(result.some((a) => a.id === created.id)).toBe(false);

    // A different actor who hasn't dismissed it still sees it.
    const adminView = await announcementService.getActiveAnnouncements(adminActor);
    expect(adminView.some((a) => a.id === created.id)).toBe(true);
  });

  it('dismissAnnouncement throws UnauthorizedError for no actor', async () => {
    await expect(announcementService.dismissAnnouncement(null, 'whatever')).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it('dismissAnnouncement throws ValidationError for an empty id', async () => {
    await expect(announcementService.dismissAnnouncement(doctorActor, '')).rejects.toThrow(
      ValidationError,
    );
  });

  it('dismissAnnouncement is idempotent (upsert, not duplicate rows)', async () => {
    const created = await announcementService.createAnnouncement(adminActor, {
      title: 'Dismiss twice',
      body: 'Body',
    });
    createdAnnouncementIds.push(created.id);

    await announcementService.dismissAnnouncement(doctorActor, created.id);
    await announcementService.dismissAnnouncement(doctorActor, created.id);

    const rows = await prisma.announcementDismissal.findMany({
      where: { userId: doctorUserId, announcementId: created.id },
    });
    expect(rows).toHaveLength(1);
  });

  it('updateAnnouncement throws ValidationError when id is missing', async () => {
    await expect(
      announcementService.updateAnnouncement(adminActor, {
        id: '',
        title: 'T',
        body: 'B',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('updateAnnouncement updates fields as admin', async () => {
    const created = await announcementService.createAnnouncement(adminActor, {
      title: 'Before',
      body: 'Before body',
    });
    createdAnnouncementIds.push(created.id);

    const updated = await announcementService.updateAnnouncement(adminActor, {
      id: created.id,
      title: 'After',
      body: 'After body',
      active: false,
    });
    expect(updated.title).toBe('After');
    expect(updated.body).toBe('After body');
    expect(updated.active).toBe(false);
  });

  it('getAnnouncement throws NotFoundError for a missing id', async () => {
    await expect(announcementService.getAnnouncement(adminActor, 'does-not-exist')).rejects.toThrow(
      NotFoundError,
    );
  });

  it('deleteAnnouncement removes the row as admin', async () => {
    const created = await announcementService.createAnnouncement(adminActor, {
      title: 'Doomed',
      body: 'Body',
    });
    await announcementService.deleteAnnouncement(adminActor, created.id);
    await expect(announcementService.getAnnouncement(adminActor, created.id)).rejects.toThrow(
      NotFoundError,
    );
  });
});
