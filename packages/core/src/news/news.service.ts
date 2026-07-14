import { prisma } from '@docjob/db';
import { assertAdmin, type Actor } from '../shared/actor';
import { NotFoundError, ValidationError } from '../shared/errors';
import { serializeNewsItem, type SerializedNewsItem } from './news.mapper';

export type NewsInput = { title: string; body: string; date?: string };

const NEWS_ADMIN_ONLY = 'Управлять новостями может только администратор.';

/**
 * Validation ported verbatim from `validateNewsInput` in the old
 * apps/web/src/app/actions.ts — same checks, same Russian messages, now
 * throwing `ValidationError` instead of returning a `{success:false}` shape.
 */
function parseNewsInput(input: NewsInput): { title: string; body: string; date: Date | null } {
  const title = input.title?.trim();
  const body = input.body?.trim();
  if (!title || title.length > 200) {
    throw new ValidationError('Заголовок обязателен и не более 200 символов.');
  }
  if (!body || body.length > 10000) {
    throw new ValidationError('Текст обязателен и не более 10000 символов.');
  }
  if (input.date) {
    const date = new Date(input.date);
    if (Number.isNaN(date.getTime())) throw new ValidationError('Некорректная дата.');
    return { title, body, date };
  }
  return { title, body, date: null };
}

/**
 * Public news feed, newest first. No auth — used both by the `getNews`
 * server action and directly by Server Components (landing page, /news,
 * sitemap) via `@/lib/news.ts#getPublicNewsItems`, which delegates here.
 */
export async function listPublicNews(): Promise<SerializedNewsItem[]> {
  const items = await prisma.newsItem.findMany({ orderBy: { date: 'desc' } });
  return items.map(serializeNewsItem);
}

/** Fetch a single news item by id. Admin only. Throws NotFoundError if missing. */
export async function getNewsItem(actor: Actor | null, id: string): Promise<SerializedNewsItem> {
  assertAdmin(actor, NEWS_ADMIN_ONLY);
  const item = await prisma.newsItem.findUnique({ where: { id } });
  if (!item) throw new NotFoundError('Новость не найдена.');
  return serializeNewsItem(item);
}

/** Create a news item. Admin only. */
export async function createNews(actor: Actor | null, input: NewsInput): Promise<{ id: string }> {
  assertAdmin(actor, NEWS_ADMIN_ONLY);
  const { title, body, date } = parseNewsInput(input);
  const created = await prisma.newsItem.create({
    data: { title, body, date: date ?? new Date() },
  });
  return { id: created.id };
}

/** Update a news item. Admin only. */
export async function updateNews(
  actor: Actor | null,
  id: string,
  input: NewsInput,
): Promise<{ id: string }> {
  assertAdmin(actor, NEWS_ADMIN_ONLY);
  const { title, body, date } = parseNewsInput(input);
  await prisma.newsItem.update({
    where: { id },
    data: { title, body, ...(date ? { date } : {}) },
  });
  return { id };
}

/** Delete a news item. Admin only. */
export async function deleteNews(actor: Actor | null, id: string): Promise<{ id: string }> {
  assertAdmin(actor, NEWS_ADMIN_ONLY);
  await prisma.newsItem.delete({ where: { id } });
  return { id };
}
