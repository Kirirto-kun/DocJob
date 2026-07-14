/**
 * Integration tests for refresh.service — run against the real dev Postgres
 * (same harness Task 2 established for @docjob/core: DATABASE_URL loaded via
 * `dotenv -e ../../.env.local -e ../../.env` in the package's `test` script).
 *
 * Each test creates its own rows (a throwaway User, plus whatever
 * RefreshToken rows the service creates) and cleans them up in `finally`,
 * rather than relying on transaction rollback.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@docjob/db';
import { issueRefreshFamily, rotateRefresh, revokeFamily, revokeAllForUser } from './refresh.service';

describe('refresh.service (integration, real Postgres)', () => {
  const createdUserIds: string[] = [];

  afterEach(async () => {
    if (createdUserIds.length) {
      // RefreshToken rows cascade-delete with the user (onDelete: Cascade).
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }
  });

  async function makeUser(): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `auth-refresh-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
        passwordHash: 'unused-in-tests',
        name: 'Refresh Test User',
        role: 'DOCTOR',
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  it('issueRefreshFamily creates a row with a 60-day expiry and a distinct familyId per call', async () => {
    const userId = await makeUser();
    const a = await issueRefreshFamily(userId);
    const b = await issueRefreshFamily(userId);

    expect(a.familyId).not.toBe(b.familyId);
    expect(typeof a.raw).toBe('string');
    expect(a.raw.length).toBeGreaterThan(0);

    const row = await prisma.refreshToken.findFirst({ where: { familyId: a.familyId } });
    expect(row).not.toBeNull();
    expect(row!.userId).toBe(userId);
    const daysUntilExpiry = (a.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(daysUntilExpiry).toBeGreaterThan(59);
    expect(daysUntilExpiry).toBeLessThan(61);
  });

  it('rotateRefresh: issue -> rotate returns a new raw and marks the old row rotatedToId + replacedAt', async () => {
    const userId = await makeUser();
    const { raw, familyId } = await issueRefreshFamily(userId);

    const result = await rotateRefresh(raw);
    expect(result).not.toBeNull();
    expect(result).toMatchObject({ ok: true, userId, familyId });
    if (!result || !('ok' in result) || !result.ok) throw new Error('expected ok:true');
    expect(result.newRaw).not.toBe(raw);

    const rows = await prisma.refreshToken.findMany({ where: { familyId }, orderBy: { createdAt: 'asc' } });
    expect(rows).toHaveLength(2);
    const [old, child] = rows;
    expect(old.rotatedToId).toBe(child.id);
    expect(old.replacedAt).not.toBeNull();
    expect(old.revokedAt).toBeNull();
    expect(child.revokedAt).toBeNull();
  });

  it('rotateRefresh: reusing the OLD raw again after the grace window revokes the whole family', async () => {
    const userId = await makeUser();
    const { raw, familyId } = await issueRefreshFamily(userId);
    await rotateRefresh(raw, 0); // grace=0 so any subsequent reuse is immediately outside the window

    // Wait a tick to guarantee we're past a zero-second grace window.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const reuseResult = await rotateRefresh(raw, 0);
    expect(reuseResult).toEqual({ revoked: true });

    const rows = await prisma.refreshToken.findMany({ where: { familyId } });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      expect(row.revokedAt).not.toBeNull();
      expect(row.revokeReason).toBe('reuse-detected');
    }
  });

  it('rotateRefresh: reusing the OLD raw again WITHIN the grace window returns ok:true without revoking', async () => {
    const userId = await makeUser();
    const { raw, familyId } = await issueRefreshFamily(userId);
    const first = await rotateRefresh(raw, 30);
    expect(first).not.toBeNull();
    if (!first || !('ok' in first) || !first.ok) throw new Error('expected ok:true on first rotate');

    const second = await rotateRefresh(raw, 30);
    expect(second).not.toBeNull();
    expect(second).toMatchObject({ ok: true, userId, familyId });

    const rows = await prisma.refreshToken.findMany({ where: { familyId } });
    expect(rows.every((r) => r.revokedAt === null)).toBe(true);
  });

  it('rotateRefresh returns null for an unknown token', async () => {
    const result = await rotateRefresh('this-token-does-not-exist-in-the-db');
    expect(result).toBeNull();
  });

  it('rotateRefresh returns null for an expired token', async () => {
    const userId = await makeUser();
    const { raw, familyId } = await issueRefreshFamily(userId);
    // Force-expire the row directly.
    await prisma.refreshToken.updateMany({ where: { familyId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const result = await rotateRefresh(raw);
    expect(result).toBeNull();
  });

  it('revokeFamily revokes only the targeted family', async () => {
    const userId = await makeUser();
    const a = await issueRefreshFamily(userId);
    const b = await issueRefreshFamily(userId);

    await revokeFamily(a.familyId, 'manual-test-revoke');

    const aRows = await prisma.refreshToken.findMany({ where: { familyId: a.familyId } });
    const bRows = await prisma.refreshToken.findMany({ where: { familyId: b.familyId } });
    expect(aRows.every((r) => r.revokedAt !== null && r.revokeReason === 'manual-test-revoke')).toBe(true);
    expect(bRows.every((r) => r.revokedAt === null)).toBe(true);
  });

  it('revokeAllForUser revokes every active family for that user, leaving other users untouched', async () => {
    const userId = await makeUser();
    const otherUserId = await makeUser();
    const a = await issueRefreshFamily(userId);
    const b = await issueRefreshFamily(userId);
    const other = await issueRefreshFamily(otherUserId);

    await revokeAllForUser(userId, 'logout-everywhere');

    const aRows = await prisma.refreshToken.findMany({ where: { familyId: a.familyId } });
    const bRows = await prisma.refreshToken.findMany({ where: { familyId: b.familyId } });
    const otherRows = await prisma.refreshToken.findMany({ where: { familyId: other.familyId } });

    expect(aRows.every((r) => r.revokedAt !== null)).toBe(true);
    expect(bRows.every((r) => r.revokedAt !== null)).toBe(true);
    expect(otherRows.every((r) => r.revokedAt === null)).toBe(true);
  });
});
