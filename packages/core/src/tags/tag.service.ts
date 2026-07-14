import { prisma } from '@docjob/db';
import { assertAdmin, assertApproved, type Actor } from '../shared/actor';
import { ValidationError } from '../shared/errors';

/** List every tag label, alphabetically. Any approved user. */
export async function getTags(actor: Actor | null): Promise<string[]> {
  assertApproved(actor, 'Требуется авторизация.');
  const tags = await prisma.tag.findMany({ orderBy: { label: 'asc' } });
  return tags.map((t) => t.label);
}

/**
 * Add a tag, deduped/normalized by trimmed label (upsert on the unique
 * `Tag.label` column — calling this twice with the same label, or with
 * incidental leading/trailing whitespace, is a no-op the second time).
 * Admin only — the tag-picker UI that calls this only lives in the admin
 * case-authoring flow, and an open `assertApproved` gate let any approved
 * doctor/reviewer pollute the shared tag taxonomy.
 */
export async function addTag(actor: Actor | null, label: string): Promise<{ label: string }> {
  assertAdmin(actor, 'Добавлять теги может только администратор.');
  const trimmed = label.trim();
  if (!trimmed) throw new ValidationError('Пустой тег.');
  await prisma.tag.upsert({
    where: { label: trimmed },
    update: {},
    create: { label: trimmed },
  });
  return { label: trimmed };
}
