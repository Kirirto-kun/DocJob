/**
 * Integration tests for tag.service — run against the real dev Postgres
 * (same harness Task 2 established). Each test creates its own rows and
 * cleans them up.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@docjob/db';
import { UnauthorizedError, ValidationError } from '../shared/errors';
import type { Actor } from '../shared/actor';
import * as tagService from './tag.service';

describe('tag.service (integration, real Postgres)', () => {
  let userId: string;
  let userActor: Actor;
  const createdLabels: string[] = [];

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `core-tag-user-${Date.now()}@test.local`,
        passwordHash: 'unused-in-tests',
        name: 'Core Tag User',
        role: 'DOCTOR',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    userId = user.id;
    userActor = { id: user.id, role: 'DOCTOR', approvedAt: new Date() };
  });

  afterAll(async () => {
    if (createdLabels.length) {
      await prisma.tag.deleteMany({ where: { label: { in: createdLabels } } });
    }
    await prisma.user.delete({ where: { id: userId } });
  });

  it('addTag throws UnauthorizedError for no actor', async () => {
    await expect(tagService.addTag(null, 'whatever')).rejects.toThrow(UnauthorizedError);
  });

  it('addTag rejects an empty (whitespace-only) label', async () => {
    await expect(tagService.addTag(userActor, '   ')).rejects.toThrow(ValidationError);
    await expect(tagService.addTag(userActor, '   ')).rejects.toThrow('Пустой тег.');
  });

  it('addTag trims the label before storing', async () => {
    const label = `core-tag-trim-${Date.now()}`;
    createdLabels.push(label);

    const result = await tagService.addTag(userActor, `  ${label}  `);
    expect(result).toEqual({ label });

    const row = await prisma.tag.findUnique({ where: { label } });
    expect(row).not.toBeNull();
  });

  it('addTag dedups by label: calling it twice with the same label upserts, not duplicates', async () => {
    const label = `core-tag-dedup-${Date.now()}`;
    createdLabels.push(label);

    await tagService.addTag(userActor, label);
    await tagService.addTag(userActor, label);

    const rows = await prisma.tag.findMany({ where: { label } });
    expect(rows).toHaveLength(1);
  });

  it('getTags returns labels alphabetically and includes a newly added tag', async () => {
    const label = `core-tag-list-${Date.now()}`;
    createdLabels.push(label);
    await tagService.addTag(userActor, label);

    const tags = await tagService.getTags(userActor);
    expect(tags).toContain(label);
    const sorted = [...tags].sort((a, b) => a.localeCompare(b));
    expect(tags).toEqual(sorted);
  });

  it('getTags throws UnauthorizedError for no actor', async () => {
    await expect(tagService.getTags(null)).rejects.toThrow(UnauthorizedError);
  });
});
