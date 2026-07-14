/**
 * Integration tests for saved.service — run against the real dev Postgres
 * (same harness Task 2 established). Each test creates its own rows and
 * cleans them up (create → assert → delete) rather than relying on
 * transaction rollback.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@docjob/db';
import { NotFoundError, UnauthorizedError } from '../shared/errors';
import type { Actor } from '../shared/actor';
import * as caseService from '../cases/case.service';
import * as savedService from './saved.service';

describe('saved.service (integration, real Postgres)', () => {
  let adminUserId: string;
  let adminActor: Actor;
  let userAId: string;
  let userAActor: Actor;
  let userBId: string;
  let userBActor: Actor;
  let caseId: string;
  let otherCaseId: string;

  beforeAll(async () => {
    const suffix = Date.now();
    const admin = await prisma.user.create({
      data: {
        email: `core-saved-admin-${suffix}@test.local`,
        passwordHash: 'unused-in-tests',
        name: 'Core Saved Admin',
        role: 'ADMIN',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    adminUserId = admin.id;
    adminActor = { id: admin.id, role: 'ADMIN', approvedAt: new Date() };

    const userA = await prisma.user.create({
      data: {
        email: `core-saved-usera-${suffix}@test.local`,
        passwordHash: 'unused-in-tests',
        name: 'Core Saved User A',
        role: 'DOCTOR',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    userAId = userA.id;
    userAActor = { id: userA.id, role: 'DOCTOR', approvedAt: new Date() };

    const userB = await prisma.user.create({
      data: {
        email: `core-saved-userb-${suffix}@test.local`,
        passwordHash: 'unused-in-tests',
        name: 'Core Saved User B',
        role: 'DOCTOR',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    userBId = userB.id;
    userBActor = { id: userB.id, role: 'DOCTOR', approvedAt: new Date() };

    const created = await caseService.createCase(adminActor, { name: 'Core Saved Test Case' });
    caseId = created.id;
    const otherCreated = await caseService.createCase(adminActor, { name: 'Core Saved Other Case' });
    otherCaseId = otherCreated.id;
  });

  afterAll(async () => {
    await prisma.savedCase.deleteMany({ where: { userId: { in: [userAId, userBId, adminUserId] } } });
    await prisma.case.deleteMany({ where: { id: { in: [caseId, otherCaseId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [adminUserId, userAId, userBId] } } });
  });

  it('toggleSavedCase throws UnauthorizedError for no actor', async () => {
    await expect(savedService.toggleSavedCase(null, caseId)).rejects.toThrow(UnauthorizedError);
  });

  it('toggleSavedCase throws NotFoundError for a missing case', async () => {
    await expect(savedService.toggleSavedCase(userAActor, 'does-not-exist')).rejects.toThrow(
      NotFoundError,
    );
  });

  it('toggleSavedCase is idempotent per (userId, caseId): save, then un-save, then save again', async () => {
    const first = await savedService.toggleSavedCase(userAActor, caseId);
    expect(first).toEqual({ saved: true });

    const rowsAfterSave = await prisma.savedCase.findMany({ where: { userId: userAId, caseId } });
    expect(rowsAfterSave).toHaveLength(1);

    const second = await savedService.toggleSavedCase(userAActor, caseId);
    expect(second).toEqual({ saved: false });

    const rowsAfterUnsave = await prisma.savedCase.findMany({ where: { userId: userAId, caseId } });
    expect(rowsAfterUnsave).toHaveLength(0);

    const third = await savedService.toggleSavedCase(userAActor, caseId);
    expect(third).toEqual({ saved: true });
    const rowsAfterReSave = await prisma.savedCase.findMany({ where: { userId: userAId, caseId } });
    expect(rowsAfterReSave).toHaveLength(1);
  });

  it('isCaseSaved reflects the toggle state and is scoped per user', async () => {
    expect(await savedService.isCaseSaved(userAActor, caseId)).toEqual({ saved: true });
    expect(await savedService.isCaseSaved(userBActor, caseId)).toEqual({ saved: false });
  });

  it('getSavedCaseIds returns only the actor\'s own saved case ids', async () => {
    await savedService.toggleSavedCase(userBActor, otherCaseId);

    const idsA = await savedService.getSavedCaseIds(userAActor);
    expect(idsA).toContain(caseId);
    expect(idsA).not.toContain(otherCaseId);

    const idsB = await savedService.getSavedCaseIds(userBActor);
    expect(idsB).toContain(otherCaseId);
    expect(idsB).not.toContain(caseId);
  });

  it('getSavedCases returns a SerializedSavedCase with a case-list-item summary', async () => {
    const rows = await savedService.getSavedCases(userAActor);
    const match = rows.find((r) => r.caseId === caseId);
    expect(match).toBeDefined();
    expect(match!.case).toMatchObject({ id: caseId, name: 'Core Saved Test Case' });
  });
});
