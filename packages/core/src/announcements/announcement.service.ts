import { prisma } from '@docjob/db';
import { assertAdmin, type Actor } from '../shared/actor';
import { NotFoundError, UnauthorizedError, ValidationError } from '../shared/errors';
import { serializeAnnouncement, type SerializedAnnouncement } from './announcement.mapper';

export type AnnouncementInput = {
  id?: string;
  title: string;
  body: string;
  imageUrl?: string;
  linkUrl?: string;
  linkLabel?: string;
  active?: boolean;
  expiresAt?: string;
};

const ANNOUNCEMENT_ADMIN_ONLY = 'Управлять объявлениями может только администратор.';

/**
 * Validation ported verbatim from `validateAnnouncementInput` in the old
 * apps/web/src/app/actions.ts — same checks, same Russian messages, now
 * throwing `ValidationError` instead of returning a `{success:false}` shape.
 */
function parseAnnouncementInput(input: AnnouncementInput): {
  title: string;
  body: string;
  imageUrl: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  active: boolean;
  expiresAt: Date | null;
} {
  const title = input.title?.trim();
  const body = input.body?.trim();
  if (!title || title.length > 200) {
    throw new ValidationError('Заголовок обязателен и не более 200 символов.');
  }
  if (!body || body.length > 5000) {
    throw new ValidationError('Текст обязателен и не более 5000 символов.');
  }

  const linkUrl = input.linkUrl?.trim() || null;
  if (linkUrl) {
    try {
      new URL(linkUrl);
    } catch {
      throw new ValidationError('Некорректная ссылка.');
    }
  }

  let expiresAt: Date | null = null;
  if (input.expiresAt) {
    const date = new Date(input.expiresAt);
    if (Number.isNaN(date.getTime())) throw new ValidationError('Некорректная дата окончания.');
    expiresAt = date;
  }

  return {
    title,
    body,
    imageUrl: input.imageUrl?.trim() || null,
    linkUrl,
    linkLabel: input.linkLabel?.trim() || null,
    active: input.active ?? true,
    expiresAt,
  };
}

// --- Public (per logged-in user) ---

/**
 * Active, non-expired announcements the current actor hasn't dismissed yet.
 * Preserves the original behavior exactly: no actor (guest) is NOT an
 * error — it just returns an empty list (the original action called
 * `getCurrentUser()` and returned `ok([])` rather than throwing). Also note
 * the original never gated on `approvedAt`, only on being logged in at all —
 * so this deliberately does not use `assertApproved`.
 */
export async function getActiveAnnouncements(actor: Actor | null): Promise<SerializedAnnouncement[]> {
  if (!actor) return [];

  const now = new Date();
  const dismissals = await prisma.announcementDismissal.findMany({
    where: { userId: actor.id },
    select: { announcementId: true },
  });
  const dismissedIds = dismissals.map((d) => d.announcementId);
  const items = await prisma.announcement.findMany({
    where: {
      active: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      ...(dismissedIds.length > 0 ? { id: { notIn: dismissedIds } } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  return items.map(serializeAnnouncement);
}

/** Dismiss an announcement for the current actor (idempotent upsert). Any logged-in actor. */
export async function dismissAnnouncement(
  actor: Actor | null,
  announcementId: string,
): Promise<{ id: string }> {
  if (!actor) throw new UnauthorizedError('Требуется авторизация.');
  if (!announcementId) throw new ValidationError('Некорректные данные.');

  await prisma.announcementDismissal.upsert({
    where: { userId_announcementId: { userId: actor.id, announcementId } },
    create: { userId: actor.id, announcementId },
    update: {},
  });
  return { id: announcementId };
}

// --- Admin CRUD ---

/** List every announcement, newest first. Admin only. */
export async function getAnnouncements(actor: Actor | null): Promise<SerializedAnnouncement[]> {
  assertAdmin(actor, ANNOUNCEMENT_ADMIN_ONLY);
  const items = await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' } });
  return items.map(serializeAnnouncement);
}

/** Fetch a single announcement by id. Admin only. Throws NotFoundError if missing. */
export async function getAnnouncement(actor: Actor | null, id: string): Promise<SerializedAnnouncement> {
  assertAdmin(actor, ANNOUNCEMENT_ADMIN_ONLY);
  const item = await prisma.announcement.findUnique({ where: { id } });
  if (!item) throw new NotFoundError('Объявление не найдено.');
  return serializeAnnouncement(item);
}

/** Create an announcement. Admin only. */
export async function createAnnouncement(
  actor: Actor | null,
  input: AnnouncementInput,
): Promise<SerializedAnnouncement> {
  assertAdmin(actor, ANNOUNCEMENT_ADMIN_ONLY);
  const data = parseAnnouncementInput(input);
  const created = await prisma.announcement.create({ data });
  return serializeAnnouncement(created);
}

/** Update an announcement. Admin only. */
export async function updateAnnouncement(
  actor: Actor | null,
  input: AnnouncementInput & { id: string },
): Promise<SerializedAnnouncement> {
  assertAdmin(actor, ANNOUNCEMENT_ADMIN_ONLY);
  if (!input.id) throw new ValidationError('Некорректные данные.');
  const data = parseAnnouncementInput(input);
  const updated = await prisma.announcement.update({ where: { id: input.id }, data });
  return serializeAnnouncement(updated);
}

/** Delete an announcement. Admin only. */
export async function deleteAnnouncement(actor: Actor | null, id: string): Promise<{ id: string }> {
  assertAdmin(actor, ANNOUNCEMENT_ADMIN_ONLY);
  await prisma.announcement.delete({ where: { id } });
  return { id };
}
