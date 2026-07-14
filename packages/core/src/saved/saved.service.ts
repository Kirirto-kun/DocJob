import { prisma } from '@docjob/db';
import type { CaseMode } from '@docjob/types';
import { assertApproved, type Actor } from '../shared/actor';
import { NotFoundError } from '../shared/errors';
import type { SerializedCaseListItem } from '../cases/case.mapper';

// No dedicated mapper file for this domain (per the brief, only reviews
// needed one) — `SerializedSavedCase` reuses the existing
// `SerializedCaseListItem` shape from `cases/case.mapper` for its nested
// `case` field rather than duplicating a case mapper.
export type SerializedSavedCase = {
  id: string;
  caseId: string;
  createdAt: string;
  case: SerializedCaseListItem;
};

/**
 * Toggle whether the current actor has bookmarked a case. Idempotent per
 * `(userId, caseId)` — the unique constraint on `SavedCase` guarantees at
 * most one row per pair; calling this twice in a row un-saves what the first
 * call saved.
 */
export async function toggleSavedCase(actor: Actor | null, caseId: string): Promise<{ saved: boolean }> {
  const user = assertApproved(actor, 'Требуется авторизация.');

  const existing = await prisma.savedCase.findUnique({
    where: { userId_caseId: { userId: user.id, caseId } },
  });

  if (existing) {
    await prisma.savedCase.delete({ where: { id: existing.id } });
    return { saved: false };
  }

  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true } });
  if (!c) throw new NotFoundError('Кейс не найден.');

  await prisma.savedCase.create({ data: { userId: user.id, caseId } });
  return { saved: true };
}

/** Whether the current actor has saved a given case. */
export async function isCaseSaved(actor: Actor | null, caseId: string): Promise<{ saved: boolean }> {
  const user = assertApproved(actor, 'Требуется авторизация.');
  const existing = await prisma.savedCase.findUnique({
    where: { userId_caseId: { userId: user.id, caseId } },
    select: { id: true },
  });
  return { saved: existing !== null };
}

/** List the current actor's saved cases (newest first), each with a case-list-item summary. */
export async function getSavedCases(actor: Actor | null): Promise<SerializedSavedCase[]> {
  const user = assertApproved(actor, 'Требуется авторизация.');
  const rows = await prisma.savedCase.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      case: {
        select: {
          id: true,
          authorId: true,
          name: true,
          primaryCondition: true,
          subgroup: true,
          specialty: true,
          tags: true,
          teaser: true,
          mode: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    caseId: r.caseId,
    createdAt: r.createdAt.toISOString(),
    case: {
      id: r.case.id,
      authorId: r.case.authorId,
      name: r.case.name,
      primaryCondition: r.case.primaryCondition,
      subgroup: r.case.subgroup,
      specialty: r.case.specialty,
      tags: r.case.tags,
      teaser: r.case.teaser,
      mode: r.case.mode as CaseMode,
      createdAt: r.case.createdAt.toISOString(),
      updatedAt: r.case.updatedAt.toISOString(),
    },
  }));
}

/** Just the saved case ids for the current actor (no case data). */
export async function getSavedCaseIds(actor: Actor | null): Promise<string[]> {
  const user = assertApproved(actor, 'Требуется авторизация.');
  const rows = await prisma.savedCase.findMany({
    where: { userId: user.id },
    select: { caseId: true },
  });
  return rows.map((r) => r.caseId);
}
