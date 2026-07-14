/**
 * Integration tests for news.service — run against the real dev Postgres
 * (same harness Task 2 established: DATABASE_URL loaded via
 * `dotenv -e ../../.env.local -e ../../.env` in the package's `test`
 * script).
 *
 * NOTE (SP-1b Task 7): local Docker/Postgres is down in this environment, so
 * these tests could not be run live. They follow the exact same pattern as
 * `submissions/submission.service.test.ts` (create own rows -> assert ->
 * clean up in `afterAll`) and are expected to pass once the DB is back up.
 * Verified via `pnpm --filter @docjob/core typecheck` instead.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@docjob/db';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../shared/errors';
import type { Actor } from '../shared/actor';
import * as newsService from './news.service';

describe('news.service (integration, real Postgres)', () => {
  let adminUserId: string;
  let adminActor: Actor;
  let doctorUserId: string;
  let doctorActor: Actor;
  const createdNewsIds: string[] = [];

  beforeAll(async () => {
    const suffix = Date.now();
    const admin = await prisma.user.create({
      data: {
        email: `core-news-admin-${suffix}@test.local`,
        passwordHash: 'unused-in-tests',
        name: 'Core News Admin',
        role: 'ADMIN',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    adminUserId = admin.id;
    adminActor = { id: admin.id, role: 'ADMIN', approvedAt: new Date() };

    const doctor = await prisma.user.create({
      data: {
        email: `core-news-doctor-${suffix}@test.local`,
        passwordHash: 'unused-in-tests',
        name: 'Core News Doctor',
        role: 'DOCTOR',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    doctorUserId = doctor.id;
    doctorActor = { id: doctor.id, role: 'DOCTOR', approvedAt: new Date() };
  });

  afterAll(async () => {
    if (createdNewsIds.length) {
      await prisma.newsItem.deleteMany({ where: { id: { in: createdNewsIds } } });
    }
    await prisma.user.deleteMany({ where: { id: { in: [adminUserId, doctorUserId] } } });
  });

  it('createNews throws UnauthorizedError for no actor', async () => {
    await expect(
      newsService.createNews(null, { title: 'T', body: 'B' }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('createNews throws ForbiddenError for a non-admin actor', async () => {
    await expect(
      newsService.createNews(doctorActor, { title: 'T', body: 'B' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('createNews rejects an empty title with the original Russian validation message', async () => {
    await expect(newsService.createNews(adminActor, { title: '', body: 'B' })).rejects.toThrow(
      'Заголовок обязателен и не более 200 символов.',
    );
  });

  it('createNews rejects an empty body with the original Russian validation message', async () => {
    await expect(newsService.createNews(adminActor, { title: 'T', body: '' })).rejects.toThrow(
      'Текст обязателен и не более 10000 символов.',
    );
  });

  it('createNews rejects an unparseable date', async () => {
    await expect(
      newsService.createNews(adminActor, { title: 'T', body: 'B', date: 'not-a-date' }),
    ).rejects.toThrow('Некорректная дата.');
  });

  it('createNews persists a news item as admin', async () => {
    const created = await newsService.createNews(adminActor, {
      title: 'Test headline',
      body: 'Test body content.',
    });
    createdNewsIds.push(created.id);
    expect(created.id).toBeTruthy();
  });

  it('listPublicNews requires no actor and includes a created item', async () => {
    const created = await newsService.createNews(adminActor, {
      title: 'Public feed item',
      body: 'Visible to everyone.',
    });
    createdNewsIds.push(created.id);

    const items = await newsService.listPublicNews();
    expect(items.some((i) => i.id === created.id)).toBe(true);
  });

  it('getNewsItem returns the item for admin', async () => {
    const created = await newsService.createNews(adminActor, {
      title: 'Fetchable item',
      body: 'Body.',
    });
    createdNewsIds.push(created.id);

    const item = await newsService.getNewsItem(adminActor, created.id);
    expect(item).toEqual({
      id: created.id,
      title: 'Fetchable item',
      body: 'Body.',
      date: expect.any(String),
    });
  });

  it('getNewsItem throws NotFoundError for a missing id', async () => {
    await expect(newsService.getNewsItem(adminActor, 'does-not-exist')).rejects.toThrow(
      NotFoundError,
    );
  });

  it('updateNews updates title/body as admin', async () => {
    const created = await newsService.createNews(adminActor, {
      title: 'Before',
      body: 'Before body',
    });
    createdNewsIds.push(created.id);

    await newsService.updateNews(adminActor, created.id, { title: 'After', body: 'After body' });
    const item = await newsService.getNewsItem(adminActor, created.id);
    expect(item.title).toBe('After');
    expect(item.body).toBe('After body');
  });

  it('updateNews throws ForbiddenError for a non-admin actor', async () => {
    const created = await newsService.createNews(adminActor, { title: 'X', body: 'Y' });
    createdNewsIds.push(created.id);
    await expect(
      newsService.updateNews(doctorActor, created.id, { title: 'X2', body: 'Y2' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('deleteNews removes the item as admin', async () => {
    const created = await newsService.createNews(adminActor, { title: 'Doomed', body: 'B' });
    await newsService.deleteNews(adminActor, created.id);
    await expect(newsService.getNewsItem(adminActor, created.id)).rejects.toThrow(NotFoundError);
  });

  it('deleteNews throws UnauthorizedError for no actor', async () => {
    const created = await newsService.createNews(adminActor, { title: 'Keep', body: 'B' });
    createdNewsIds.push(created.id);
    await expect(newsService.deleteNews(null, created.id)).rejects.toThrow(UnauthorizedError);
  });
});
