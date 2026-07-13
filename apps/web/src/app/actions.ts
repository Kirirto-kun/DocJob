'use server';

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { Prisma, Role } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma } from '@docjob/db';
import { getPublicNewsItems } from '@/lib/news';
import { getCurrentUser, requireUser, requireAdmin } from '@/lib/session';
import { analyzeStudentQuestion, AnalyzeStudentQuestionInput } from '@/ai/flows/analyze-student-question';
import { generatePersonalizedScenario, GeneratePersonalizedScenarioInput } from '@/ai/flows/generate-personalized-scenario';
import { simulateComorbidities, SimulateComorbiditiesInput } from '@/ai/flows/simulate-comorbidities';
import { savePatientRecord } from '@/services/patient-record';
import { deleteAttachmentFile } from '@/lib/storage';
import {
  generateResetToken,
  hashResetToken,
  resetTokenExpiry,
  isResetTokenUsable,
  isWithinResendCooldown,
} from '@/lib/password-reset-tokens';
import { sendEmail, buildPasswordResetEmail, buildContactEmail } from '@/lib/email';
import { SITE_EMAIL } from '@/lib/site';
import {
  structureCaseFromMarkdown,
  structureCaseInputSchema,
} from '@/ai/flows/structure-case-from-markdown';
import { embedText, toVectorLiteral, upsertCaseEmbedding } from '@/lib/embeddings';
import { runChat } from '@/ai/runChat';
import { type CaseMode } from '@/lib/case-schema';
import * as core from '@docjob/core';
import { getActor, toActionResult } from '@/lib/action-helpers';

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

function fail(error: string): { success: false; error: string } {
  return { success: false, error };
}

function ok<T>(data: T): { success: true; data: T } {
  return { success: true, data };
}

// ───────────────────────── Genkit flow wrappers (existing)

export async function handleAnalyzeQuestion(input: AnalyzeStudentQuestionInput) {
  try {
    const result = await analyzeStudentQuestion(input);
    return ok(result);
  } catch (error) {
    console.error('Error analyzing question:', error);
    return fail('Не удалось получить ответ от ИИ. Попробуйте ещё раз.');
  }
}

export async function handleGenerateScenario(input: GeneratePersonalizedScenarioInput) {
  try {
    const result = await generatePersonalizedScenario(input);
    return ok(result);
  } catch (error) {
    console.error('Error generating scenario:', error);
    return fail('Не удалось сгенерировать сценарий.');
  }
}

export async function handleSimulateComorbidities(input: SimulateComorbiditiesInput) {
  try {
    const result = await simulateComorbidities(input);
    return ok(result);
  } catch (error) {
    console.error('Error simulating comorbidities:', error);
    return fail('Не удалось смоделировать сопутствующие состояния.');
  }
}

export async function handleFileUpload(formData: FormData) {
  try {
    const file = formData.get('file') as File;
    if (!file) return fail('Файл не выбран.');
    const content = await savePatientRecord(file);
    return ok({ recordContent: content });
  } catch (error) {
    console.error('Error handling file upload:', error);
    return fail('Не удалось обработать файл.');
  }
}

// ───────────────────────── Auth / users

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  fullName: z.string().optional(),
  region: z.string().optional(),
  age: z.coerce.number().int().positive().optional(),
  specialty: z.string().optional(),
  phoneNumber: z.string().optional(),
  workplace: z.string().optional(),
  academicDegree: z.string().optional(),
  consentAccepted: z.boolean().optional(),
  role: z.enum(['ADMIN', 'DOCTOR', 'REVIEWER']).optional(),
});

export async function registerUser(input: z.infer<typeof registerSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return fail('Проверьте правильность заполнения формы.');
  const data = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) return fail('Пользователь с такой почтой уже существует.');

  const passwordHash = await bcrypt.hash(data.password, 10);

  const created = await prisma.user.create({
    data: {
      email: data.email.toLowerCase(),
      passwordHash,
      name: data.name,
      fullName: data.fullName,
      region: data.region,
      age: data.age,
      specialty: data.specialty,
      phoneNumber: data.phoneNumber,
      workplace: data.workplace,
      academicDegree: data.academicDegree,
      role: (data.role as Role) ?? 'DOCTOR',
      consentAcceptedAt: data.consentAccepted ? new Date() : null,
    },
    select: { id: true },
  });
  return ok({ id: created.id });
}

const updateUserSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  fullName: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  age: z.number().int().positive().optional().nullable(),
  specialty: z.string().optional().nullable(),
  phoneNumber: z.string().optional().nullable(),
  workplace: z.string().optional().nullable(),
  academicDegree: z.string().optional().nullable(),
  profilePhotoUrl: z.string().optional().nullable(),
});

export async function updateUser(input: z.infer<typeof updateUserSchema>): Promise<ActionResult<{ id: string }>> {
  const current = await requireUserSafe();
  if (!current) return fail('Требуется авторизация.');
  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) return fail('Некорректные данные пользователя.');

  if (current.id !== parsed.data.id && current.role !== 'ADMIN') {
    return fail('Недостаточно прав.');
  }

  const { id, ...rest } = parsed.data;
  const data: Prisma.UserUpdateInput = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined) (data as Record<string, unknown>)[k] = v;
  }
  await prisma.user.update({ where: { id }, data });
  revalidatePath('/');
  return ok({ id });
}

export async function getUsers(): Promise<ActionResult<SerializedUser[]>> {
  try {
    await requireUser();
  } catch {
    return fail('Требуется авторизация.');
  }
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
  return ok(users.map(serializeUser));
}

// ───────────────────────── Registration approval (admin)

export async function getPendingUsers(): Promise<ActionResult<SerializedUser[]>> {
  try {
    await requireAdmin();
  } catch {
    return fail('Только администратор может видеть заявки.');
  }
  const users = await prisma.user.findMany({
    where: { approvedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  return ok(users.map(serializeUser));
}

export async function approveUser(userId: string): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
  } catch {
    return fail('Только администратор может одобрять заявки.');
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return fail('Пользователь не найден.');
  if (user.approvedAt) return fail('Пользователь уже одобрен.');
  await prisma.user.update({
    where: { id: userId },
    data: { approvedAt: new Date() },
  });
  revalidatePath('/admin/pending');
  return ok({ id: userId });
}

/**
 * Diagnose why a sign-in failed without itself granting a session.
 * Used by the login form when next-auth's signIn returned an error — the
 * generic NextAuth response can't tell "wrong password" from "account
 * still pending approval", so we look it up explicitly here.
 *
 * Returns:
 *   - 'pending'   — credentials match but admin hasn't approved yet
 *   - 'invalid'   — wrong email or password
 */
export async function checkLoginIssue(
  email: string,
  password: string,
): Promise<{ status: 'pending' | 'invalid' }> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (!user) return { status: 'invalid' };
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return { status: 'invalid' };
  if (!user.approvedAt) return { status: 'pending' };
  return { status: 'invalid' };
}

export async function rejectUser(userId: string): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
  } catch {
    return fail('Только администратор может отклонять заявки.');
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return fail('Пользователь не найден.');
  if (user.approvedAt) return fail('Нельзя отклонить уже одобренного пользователя.');
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath('/admin/pending');
  return ok({ id: userId });
}

/**
 * Permanently delete a user — revokes their access to the platform entirely.
 * Cascades remove their authored cases, chat sessions, saved cases, reviews and
 * submissions (see onDelete: Cascade in the schema). Admin-only; an admin
 * cannot delete their own account.
 */
export async function deleteUser(userId: string): Promise<ActionResult<{ id: string }>> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return fail('Только администратор может удалять пользователей.');
  }
  if (admin.id === userId) {
    return fail('Нельзя удалить собственную учётную запись администратора.');
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return fail('Пользователь не найден.');
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath('/admin/users');
  revalidatePath('/admin/pending');
  return ok({ id: userId });
}

// ───────────────────────── Cases
//
// Pure domain logic (validation, auth rules, Prisma calls) lives in
// @docjob/core's case.service — these are thin transport wrappers: resolve
// the actor, call core, translate thrown DomainErrors back into
// ActionResult, and run the Next.js-specific side effects (revalidatePath,
// the fire-and-forget embedding upsert, attachment-file deletion) that
// can't live in a transport-agnostic package.

export type CaseInput = core.cases.CreateCaseInput;

export async function createCase(input: CaseInput): Promise<ActionResult<SerializedCase>> {
  try {
    const actor = await getActor();
    const data = await core.cases.createCase(actor, input);
    revalidatePath('/');
    revalidatePath('/cases/[subgroup]', 'page');
    // Fire-and-forget: never block or break case creation on embedding.
    void upsertCaseEmbedding(data.id).catch(() => {});
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function updateCase(input: core.cases.UpdateCaseInput): Promise<ActionResult<SerializedCase>> {
  try {
    const actor = await getActor();
    const data = await core.cases.updateCase(actor, input);
    revalidatePath('/');
    revalidatePath(`/cases/${data.subgroup ?? ''}/${data.id}`);
    // Fire-and-forget: re-embed on edit without blocking the update.
    void upsertCaseEmbedding(data.id).catch(() => {});
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function deleteCase(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await getActor();
    const data = await core.cases.deleteCase(actor, id);
    revalidatePath('/');
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function getCases(filters?: { subgroup?: string; specialty?: string }): Promise<ActionResult<SerializedCase[]>> {
  try {
    const actor = await getActor();
    const data = await core.cases.listCases(actor, filters);
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

// ───────────────────────── Paginated cases listing (admin catalog / search)

export type SerializedCaseListItem = core.SerializedCaseListItem;
export type CasesPage = core.CasesPage;

export async function getCasesPaged(
  input?: core.cases.ListCasesPagedInput,
): Promise<ActionResult<CasesPage>> {
  try {
    const actor = await getActor();
    const data = await core.cases.listCasesPaged(actor, input);
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function getCaseById(id: string): Promise<ActionResult<SerializedCase>> {
  try {
    const actor = await getActor();
    const data = await core.cases.getCase(actor, id);
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

// ───────────────────────── Case attachments (admin)

export async function updateCaseAttachment(
  input: core.cases.UpdateCaseAttachmentInput,
): Promise<ActionResult<SerializedCaseAttachment>> {
  try {
    const actor = await getActor();
    const data = await core.cases.updateCaseAttachment(actor, input);
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function deleteCaseAttachment(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await getActor();
    const data = await core.cases.deleteCaseAttachment(actor, id);
    await deleteAttachmentFile(data.filename);
    return ok({ id: data.id });
  } catch (e) {
    return toActionResult(e);
  }
}

// ───────────────────────── Markdown structuring (admin)

export async function handleStructureCaseFromMarkdown(
  input: z.infer<typeof structureCaseInputSchema>,
) {
  try {
    await requireAdmin();
  } catch {
    return fail('Импорт markdown — только для администратора.');
  }
  const parsed = structureCaseInputSchema.safeParse(input);
  if (!parsed.success) return fail('Слишком короткий markdown для разбора.');

  try {
    const draft = await structureCaseFromMarkdown(parsed.data);
    return ok(draft);
  } catch (error) {
    console.error('[handleStructureCaseFromMarkdown] error', error);
    return fail('Не удалось разобрать markdown через OpenAI.');
  }
}

// ───────────────────────── Helpers (BlockNote → text)

function caseBodyToText(body: Prisma.JsonValue): string {
  return blocksToText(extractBlocks(body));
}

function extractBlocks(body: Prisma.JsonValue): unknown[] {
  if (!body || typeof body !== 'object') return [];
  if (Array.isArray(body)) return body;
  const blocks = (body as Record<string, unknown>).blocks;
  return Array.isArray(blocks) ? blocks : [];
}

function blocksToText(blocks: unknown[], depth = 0): string {
  const out: string[] = [];
  const indent = '  '.repeat(depth);
  for (const raw of blocks) {
    if (!raw || typeof raw !== 'object') continue;
    const block = raw as Record<string, unknown>;
    const type = String(block.type ?? 'paragraph');
    const content = inlineContentToText(block.content);
    const props = (block.props ?? {}) as Record<string, unknown>;

    switch (type) {
      case 'heading': {
        const level = Number(props.level) || 2;
        out.push(`${indent}${'#'.repeat(level)} ${content}`);
        break;
      }
      case 'bulletListItem':
        out.push(`${indent}- ${content}`);
        break;
      case 'numberedListItem':
        out.push(`${indent}1. ${content}`);
        break;
      case 'checkListItem':
        out.push(`${indent}[ ] ${content}`);
        break;
      case 'image':
        out.push(`${indent}[изображение${props.name ? `: ${props.name}` : props.url ? `: ${props.url}` : ''}]`);
        break;
      case 'file':
        out.push(`${indent}[файл${props.name ? `: ${props.name}` : props.url ? `: ${props.url}` : ''}]`);
        break;
      case 'table': {
        const rows = (block.content as Record<string, unknown> | undefined)?.rows;
        if (Array.isArray(rows)) {
          for (const row of rows) {
            const cells = (row as Record<string, unknown>).cells;
            if (Array.isArray(cells)) {
              const cellsText = cells.map((c) => inlineContentToText(c)).join(' | ');
              out.push(`${indent}| ${cellsText} |`);
            }
          }
        }
        break;
      }
      default:
        if (content) out.push(`${indent}${content}`);
    }

    const children = block.children;
    if (Array.isArray(children) && children.length) {
      out.push(blocksToText(children, depth + 1));
    }
  }
  return out.join('\n');
}

function inlineContentToText(content: unknown): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((c) => inlineContentToText(c)).join('');
  }
  if (typeof content === 'object') {
    const obj = content as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text;
    if (Array.isArray(obj.content)) return inlineContentToText(obj.content);
  }
  return '';
}

// ───────────────────────── Tags

export async function getTags(): Promise<ActionResult<string[]>> {
  try {
    await requireUser();
  } catch {
    return fail('Требуется авторизация.');
  }
  const tags = await prisma.tag.findMany({ orderBy: { label: 'asc' } });
  return ok(tags.map((t) => t.label));
}

export async function addTag(label: string): Promise<ActionResult<{ label: string }>> {
  try {
    await requireUser();
  } catch {
    return fail('Требуется авторизация.');
  }
  const trimmed = label.trim();
  if (!trimmed) return fail('Пустой тег.');
  await prisma.tag.upsert({
    where: { label: trimmed },
    update: {},
    create: { label: trimmed },
  });
  return ok({ label: trimmed });
}

// ───────────────────────── News

export async function getNews(): Promise<ActionResult<Array<{ id: string; title: string; body: string; date: string }>>> {
  try {
    return ok(await getPublicNewsItems());
  } catch (error) {
    console.error('getNews failed', error);
    return fail('Не удалось загрузить новости.');
  }
}

type NewsInput = { title: string; body: string; date?: string };

const NEWS_ADMIN_ONLY = 'Управлять новостями может только администратор.';

async function ensureNewsAdmin(): Promise<{ success: false; error: string } | null> {
  try {
    await requireAdmin();
    return null;
  } catch {
    return fail(NEWS_ADMIN_ONLY);
  }
}

function validateNewsInput(
  input: NewsInput,
): { success: false; error: string } | { success: true; data: { title: string; body: string; date: Date | null } } {
  const title = input.title?.trim();
  const body = input.body?.trim();
  if (!title || title.length > 200) return fail('Заголовок обязателен и не более 200 символов.');
  if (!body || body.length > 10000) return fail('Текст обязателен и не более 10000 символов.');
  if (input.date) {
    const date = new Date(input.date);
    if (Number.isNaN(date.getTime())) return fail('Некорректная дата.');
    return ok({ title, body, date });
  }
  return ok({ title, body, date: null });
}

function revalidateNewsPaths() {
  revalidatePath('/landing');
  revalidatePath('/news');
  revalidatePath('/admin/news');
}

export async function getNewsItem(
  id: string,
): Promise<ActionResult<{ id: string; title: string; body: string; date: string }>> {
  const denied = await ensureNewsAdmin();
  if (denied) return denied;
  const item = await prisma.newsItem.findUnique({ where: { id } });
  if (!item) return fail('Новость не найдена.');
  return ok({ id: item.id, title: item.title, body: item.body, date: item.date.toISOString() });
}

export async function createNews(input: NewsInput): Promise<ActionResult<{ id: string }>> {
  const denied = await ensureNewsAdmin();
  if (denied) return denied;
  const validation = validateNewsInput(input);
  if (!validation.success) return validation;
  const { title, body, date } = validation.data;
  const created = await prisma.newsItem.create({
    data: { title, body, date: date ?? new Date() },
  });
  revalidateNewsPaths();
  return ok({ id: created.id });
}

export async function updateNews(
  id: string,
  input: NewsInput,
): Promise<ActionResult<{ id: string }>> {
  const denied = await ensureNewsAdmin();
  if (denied) return denied;
  const validation = validateNewsInput(input);
  if (!validation.success) return validation;
  const { title, body, date } = validation.data;
  await prisma.newsItem.update({
    where: { id },
    data: { title, body, ...(date ? { date } : {}) },
  });
  revalidateNewsPaths();
  return ok({ id });
}

export async function deleteNews(id: string): Promise<ActionResult<{ id: string }>> {
  const denied = await ensureNewsAdmin();
  if (denied) return denied;
  await prisma.newsItem.delete({ where: { id } });
  revalidateNewsPaths();
  return ok({ id });
}

// ═══════════════════════════════════════════════════════════════════════════
// Announcements (admin advertisement popups) — additive section
// ═══════════════════════════════════════════════════════════════════════════

export type SerializedAnnouncement = {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AnnouncementInput = {
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

function serializeAnnouncement(item: {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  active: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): SerializedAnnouncement {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    imageUrl: item.imageUrl,
    linkUrl: item.linkUrl,
    linkLabel: item.linkLabel,
    active: item.active,
    expiresAt: item.expiresAt ? item.expiresAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

async function ensureAnnouncementAdmin(): Promise<{ success: false; error: string } | null> {
  try {
    await requireAdmin();
    return null;
  } catch {
    return fail(ANNOUNCEMENT_ADMIN_ONLY);
  }
}

function validateAnnouncementInput(
  input: AnnouncementInput,
):
  | { success: false; error: string }
  | {
      success: true;
      data: {
        title: string;
        body: string;
        imageUrl: string | null;
        linkUrl: string | null;
        linkLabel: string | null;
        active: boolean;
        expiresAt: Date | null;
      };
    } {
  const title = input.title?.trim();
  const body = input.body?.trim();
  if (!title || title.length > 200) return fail('Заголовок обязателен и не более 200 символов.');
  if (!body || body.length > 5000) return fail('Текст обязателен и не более 5000 символов.');

  const linkUrl = input.linkUrl?.trim() || null;
  if (linkUrl) {
    try {
      new URL(linkUrl);
    } catch {
      return fail('Некорректная ссылка.');
    }
  }

  let expiresAt: Date | null = null;
  if (input.expiresAt) {
    const date = new Date(input.expiresAt);
    if (Number.isNaN(date.getTime())) return fail('Некорректная дата окончания.');
    expiresAt = date;
  }

  return ok({
    title,
    body,
    imageUrl: input.imageUrl?.trim() || null,
    linkUrl,
    linkLabel: input.linkLabel?.trim() || null,
    active: input.active ?? true,
    expiresAt,
  });
}

function revalidateAnnouncementPaths() {
  revalidatePath('/admin/announcements');
  revalidatePath('/');
}

// --- Public (per logged-in user) ---

export async function getActiveAnnouncements(): Promise<ActionResult<SerializedAnnouncement[]>> {
  const user = await getCurrentUser();
  if (!user) return ok([]);
  try {
    const now = new Date();
    const dismissals = await prisma.announcementDismissal.findMany({
      where: { userId: user.id },
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
    return ok(items.map(serializeAnnouncement));
  } catch (error) {
    console.error('getActiveAnnouncements failed', error);
    return fail('Не удалось загрузить объявления.');
  }
}

export async function dismissAnnouncement(announcementId: string): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail('Требуется авторизация.');
  if (!announcementId) return fail('Некорректные данные.');
  try {
    await prisma.announcementDismissal.upsert({
      where: { userId_announcementId: { userId: user.id, announcementId } },
      create: { userId: user.id, announcementId },
      update: {},
    });
    return ok({ id: announcementId });
  } catch (error) {
    console.error('dismissAnnouncement failed', error);
    return fail('Не удалось скрыть объявление.');
  }
}

// --- Admin CRUD ---

export async function getAnnouncements(): Promise<ActionResult<SerializedAnnouncement[]>> {
  const denied = await ensureAnnouncementAdmin();
  if (denied) return denied;
  const items = await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' } });
  return ok(items.map(serializeAnnouncement));
}

export async function getAnnouncement(id: string): Promise<ActionResult<SerializedAnnouncement>> {
  const denied = await ensureAnnouncementAdmin();
  if (denied) return denied;
  const item = await prisma.announcement.findUnique({ where: { id } });
  if (!item) return fail('Объявление не найдено.');
  return ok(serializeAnnouncement(item));
}

export async function createAnnouncement(
  input: AnnouncementInput,
): Promise<ActionResult<SerializedAnnouncement>> {
  const denied = await ensureAnnouncementAdmin();
  if (denied) return denied;
  const validation = validateAnnouncementInput(input);
  if (!validation.success) return validation;
  const created = await prisma.announcement.create({ data: validation.data });
  revalidateAnnouncementPaths();
  return ok(serializeAnnouncement(created));
}

export async function updateAnnouncement(
  input: AnnouncementInput & { id: string },
): Promise<ActionResult<SerializedAnnouncement>> {
  const denied = await ensureAnnouncementAdmin();
  if (denied) return denied;
  if (!input.id) return fail('Некорректные данные.');
  const validation = validateAnnouncementInput(input);
  if (!validation.success) return validation;
  const updated = await prisma.announcement.update({
    where: { id: input.id },
    data: validation.data,
  });
  revalidateAnnouncementPaths();
  return ok(serializeAnnouncement(updated));
}

export async function deleteAnnouncement(id: string): Promise<ActionResult<{ id: string }>> {
  const denied = await ensureAnnouncementAdmin();
  if (denied) return denied;
  await prisma.announcement.delete({ where: { id } });
  revalidateAnnouncementPaths();
  return ok({ id });
}

// ───────────────────────── Serialization helpers

export type SerializedUser = {
  id: string;
  email: string;
  role: Role;
  name: string;
  fullName: string | null;
  region: string | null;
  age: number | null;
  specialty: string | null;
  phoneNumber: string | null;
  workplace: string | null;
  academicDegree: string | null;
  profilePhotoUrl: string | null;
  consentAcceptedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
};

// Case-shaped serialized types + serializeCase itself now live in
// @docjob/core (packages/core/src/cases/case.mapper.ts). Re-exported here so
// every existing `import type { SerializedCase } from '@/app/actions'` (and
// friends) across the web app keeps working unchanged.
export type SerializedCaseImage = core.SerializedCaseImage;
export type SerializedCaseAttachment = core.SerializedCaseAttachment;
export type SerializedCase = core.SerializedCase;
const { serializeCase } = core;

type PrismaUser = Awaited<ReturnType<typeof prisma.user.findFirst>>;

function serializeUser(u: NonNullable<PrismaUser>): SerializedUser {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    name: u.name,
    fullName: u.fullName,
    region: u.region,
    age: u.age,
    specialty: u.specialty,
    phoneNumber: u.phoneNumber,
    workplace: u.workplace,
    academicDegree: u.academicDegree,
    profilePhotoUrl: u.profilePhotoUrl,
    consentAcceptedAt: u.consentAcceptedAt ? u.consentAcceptedAt.toISOString() : null,
    approvedAt: u.approvedAt ? u.approvedAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  };
}

async function requireUserSafe() {
  try {
    return await requireUser();
  } catch {
    return null;
  }
}

// Current user convenience export for server components
export async function getSessionUser(): Promise<SerializedUser | null> {
  const user = await getCurrentUser();
  return user ? serializeUser(user) : null;
}

// ───────────────────────── Saved cases (favourites / bookmarks)

export type SerializedSavedCase = {
  id: string;
  caseId: string;
  createdAt: string;
  case: SerializedCaseListItem;
};

export async function toggleSavedCase(
  caseId: string,
): Promise<ActionResult<{ saved: boolean }>> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return fail('Требуется авторизация.');
  }

  const existing = await prisma.savedCase.findUnique({
    where: { userId_caseId: { userId: user.id, caseId } },
  });

  if (existing) {
    await prisma.savedCase.delete({ where: { id: existing.id } });
    revalidatePath('/saved-cases');
    return ok({ saved: false });
  }

  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true } });
  if (!c) return fail('Кейс не найден.');

  await prisma.savedCase.create({ data: { userId: user.id, caseId } });
  revalidatePath('/saved-cases');
  return ok({ saved: true });
}

export async function isCaseSaved(caseId: string): Promise<ActionResult<{ saved: boolean }>> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return fail('Требуется авторизация.');
  }
  const existing = await prisma.savedCase.findUnique({
    where: { userId_caseId: { userId: user.id, caseId } },
    select: { id: true },
  });
  return ok({ saved: existing !== null });
}

export async function getSavedCases(): Promise<ActionResult<SerializedSavedCase[]>> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return fail('Требуется авторизация.');
  }
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
  const items: SerializedSavedCase[] = rows.map((r) => ({
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
  return ok(items);
}

export async function getSavedCaseIds(): Promise<ActionResult<string[]>> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return fail('Требуется авторизация.');
  }
  const rows = await prisma.savedCase.findMany({
    where: { userId: user.id },
    select: { caseId: true },
  });
  return ok(rows.map((r) => r.caseId));
}

// ───────────────────────── Reviews

export type SerializedReview = {
  id: string;
  caseId: string;
  reviewerId: string;
  reviewerName: string;
  reviewerSpecialty: string | null;
  reviewerAcademicDegree: string | null;
  reviewerWorkplace: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type SerializedReviewWithCase = SerializedReview & {
  case: { id: string; name: string; subgroup: string | null };
};

const createReviewSchema = z.object({
  caseId: z.string().min(1),
  body: z.string().min(10, 'Текст рецензии должен содержать минимум 10 символов.'),
});

function serializeReview(r: Prisma.ReviewGetPayload<{ include: { reviewer: true } }>): SerializedReview {
  return {
    id: r.id,
    caseId: r.caseId,
    reviewerId: r.reviewerId,
    reviewerName: r.reviewer.fullName || r.reviewer.name,
    reviewerSpecialty: r.reviewer.specialty,
    reviewerAcademicDegree: r.reviewer.academicDegree,
    reviewerWorkplace: r.reviewer.workplace,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function createReview(
  input: z.infer<typeof createReviewSchema>,
): Promise<ActionResult<SerializedReview>> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return fail('Требуется авторизация.');
  }
  if (user.role !== 'REVIEWER' && user.role !== 'ADMIN') {
    return fail('Оставлять рецензии могут только рецензенты.');
  }
  const parsed = createReviewSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Некорректные данные рецензии.');
  }
  const c = await prisma.case.findUnique({ where: { id: parsed.data.caseId }, select: { id: true } });
  if (!c) return fail('Кейс не найден.');

  const created = await prisma.review.create({
    data: {
      caseId: parsed.data.caseId,
      reviewerId: user.id,
      body: parsed.data.body.trim(),
    },
    include: { reviewer: true },
  });
  revalidatePath(`/cases`);
  return ok(serializeReview(created));
}

export async function deleteReview(reviewId: string): Promise<ActionResult<{ id: string }>> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return fail('Требуется авторизация.');
  }
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) return fail('Рецензия не найдена.');
  if (review.reviewerId !== user.id && user.role !== 'ADMIN') {
    return fail('Удалять рецензию может только её автор или администратор.');
  }
  await prisma.review.delete({ where: { id: reviewId } });
  return ok({ id: reviewId });
}

export async function getReviewsForCase(caseId: string): Promise<ActionResult<SerializedReview[]>> {
  try {
    await requireUser();
  } catch {
    return fail('Требуется авторизация.');
  }
  const rows = await prisma.review.findMany({
    where: { caseId },
    include: { reviewer: true },
    orderBy: { createdAt: 'desc' },
  });
  return ok(rows.map(serializeReview));
}

export async function getMyReviews(): Promise<ActionResult<SerializedReviewWithCase[]>> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return fail('Требуется авторизация.');
  }
  const rows = await prisma.review.findMany({
    where: { reviewerId: user.id },
    include: {
      reviewer: true,
      case: { select: { id: true, name: true, subgroup: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return ok(
    rows.map((r) => ({
      ...serializeReview(r),
      case: { id: r.case.id, name: r.case.name, subgroup: r.case.subgroup },
    })),
  );
}

// ───────────────────────── Case submissions (author -> admin discussion)

export type SerializedSubmissionAttachment = {
  attachmentId: string;
  filename: string;
  originalName: string | null;
  url: string;
  mimeType: string;
  size: number;
};

export type SerializedSubmissionMessage = {
  id: string;
  submissionId: string;
  senderId: string;
  senderName: string;
  senderRole: Role;
  body: string;
  attachments: SerializedSubmissionAttachment[];
  createdAt: string;
};

export type SerializedCaseSubmission = {
  id: string;
  authorUserId: string;
  authorName: string;
  authorEmail: string;
  title: string;
  description: string;
  authors: string[];
  subgroup: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  messages: SerializedSubmissionMessage[];
  messageCount: number;
};

const createSubmissionSchema = z.object({
  title: z.string().min(3, 'Название слишком короткое.').max(200),
  description: z.string().min(10, 'Опишите кейс подробнее.').max(20000),
  authors: z.array(z.string().min(1)).default([]),
  subgroup: z.string().optional().nullable(),
  attachmentIds: z.array(z.string()).optional(),
});

const sendSubmissionMessageSchema = z.object({
  submissionId: z.string().min(1),
  body: z.string().min(1, 'Сообщение не может быть пустым.').max(5000),
  attachmentIds: z.array(z.string()).optional(),
});

async function attachmentsForIds(ids: string[]): Promise<SerializedSubmissionAttachment[]> {
  if (!ids.length) return [];
  const rows = await prisma.caseAttachment.findMany({ where: { id: { in: ids } } });
  return rows.map((a) => ({
    attachmentId: a.id,
    filename: a.filename,
    originalName: a.originalName,
    url: `/api/attachments/${a.filename}`,
    mimeType: a.mimeType,
    size: a.size,
  }));
}

export async function createCaseSubmission(
  input: z.infer<typeof createSubmissionSchema>,
): Promise<ActionResult<SerializedCaseSubmission>> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return fail('Требуется авторизация.');
  }
  const parsed = createSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Некорректные данные предложения.');
  }
  const authors = parsed.data.authors.map((a) => a.trim()).filter(Boolean);
  const attachments = await attachmentsForIds(parsed.data.attachmentIds ?? []);

  const created = await prisma.$transaction(async (tx) => {
    const submission = await tx.caseSubmission.create({
      data: {
        authorUserId: user.id,
        title: parsed.data.title.trim(),
        description: parsed.data.description.trim(),
        authors,
        subgroup: parsed.data.subgroup ?? null,
      },
    });

    const messageId = await tx.caseSubmissionMessage.create({
      data: {
        submissionId: submission.id,
        senderId: user.id,
        body: parsed.data.description.trim(),
        attachments: attachments as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    if (parsed.data.attachmentIds?.length) {
      await tx.caseAttachment.updateMany({
        where: { id: { in: parsed.data.attachmentIds }, caseId: null },
        data: { uploaderId: user.id },
      });
    }

    return { submissionId: submission.id, messageId: messageId.id };
  });

  revalidatePath('/admin/case-submissions');
  const full = await getCaseSubmissionById(created.submissionId);
  if (!full.success) return fail(full.error);
  return full;
}

export async function sendCaseSubmissionMessage(
  input: z.infer<typeof sendSubmissionMessageSchema>,
): Promise<ActionResult<SerializedSubmissionMessage>> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return fail('Требуется авторизация.');
  }
  const parsed = sendSubmissionMessageSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Некорректные данные сообщения.');
  }
  const submission = await prisma.caseSubmission.findUnique({
    where: { id: parsed.data.submissionId },
    select: { id: true, authorUserId: true },
  });
  if (!submission) return fail('Предложение не найдено.');
  if (submission.authorUserId !== user.id && user.role !== 'ADMIN') {
    return fail('Недостаточно прав для отправки сообщения.');
  }

  const attachments = await attachmentsForIds(parsed.data.attachmentIds ?? []);
  const created = await prisma.caseSubmissionMessage.create({
    data: {
      submissionId: parsed.data.submissionId,
      senderId: user.id,
      body: parsed.data.body.trim(),
      attachments: attachments as unknown as Prisma.InputJsonValue,
    },
    include: { sender: { select: { id: true, name: true, fullName: true, role: true } } },
  });

  await prisma.caseSubmission.update({
    where: { id: parsed.data.submissionId },
    data: { updatedAt: new Date() },
  });

  revalidatePath('/admin/case-submissions');
  revalidatePath('/suggest-case');
  return ok({
    id: created.id,
    submissionId: created.submissionId,
    senderId: created.senderId,
    senderName: created.sender.fullName || created.sender.name,
    senderRole: created.sender.role,
    body: created.body,
    attachments: attachments,
    createdAt: created.createdAt.toISOString(),
  });
}

export async function getMyCaseSubmissions(): Promise<ActionResult<SerializedCaseSubmission[]>> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return fail('Требуется авторизация.');
  }
  const rows = await prisma.caseSubmission.findMany({
    where: { authorUserId: user.id },
    orderBy: { updatedAt: 'desc' },
    include: {
      author: true,
      messages: { include: { sender: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  return ok(rows.map(serializeSubmission));
}

export async function getAllCaseSubmissions(): Promise<ActionResult<SerializedCaseSubmission[]>> {
  try {
    await requireAdmin();
  } catch {
    return fail('Только администратор может видеть предложенные кейсы.');
  }
  const rows = await prisma.caseSubmission.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      author: true,
      messages: { include: { sender: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  return ok(rows.map(serializeSubmission));
}

export async function getCaseSubmissionById(id: string): Promise<ActionResult<SerializedCaseSubmission>> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return fail('Требуется авторизация.');
  }
  const row = await prisma.caseSubmission.findUnique({
    where: { id },
    include: {
      author: true,
      messages: { include: { sender: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!row) return fail('Предложение не найдено.');
  if (row.authorUserId !== user.id && user.role !== 'ADMIN') {
    return fail('Недостаточно прав для просмотра предложения.');
  }
  return ok(serializeSubmission(row));
}

export async function updateCaseSubmissionStatus(
  submissionId: string,
  status: 'new' | 'in_review' | 'accepted' | 'rejected' | 'done',
): Promise<ActionResult<{ id: string; status: string }>> {
  try {
    await requireAdmin();
  } catch {
    return fail('Менять статус может только администратор.');
  }
  await prisma.caseSubmission.update({
    where: { id: submissionId },
    data: { status },
  });
  revalidatePath('/admin/case-submissions');
  return ok({ id: submissionId, status });
}

type SubmissionFull = Prisma.CaseSubmissionGetPayload<{
  include: {
    author: true;
    messages: { include: { sender: true } };
  };
}>;

function serializeSubmission(s: SubmissionFull): SerializedCaseSubmission {
  return {
    id: s.id,
    authorUserId: s.authorUserId,
    authorName: s.author.fullName || s.author.name,
    authorEmail: s.author.email,
    title: s.title,
    description: s.description,
    authors: s.authors,
    subgroup: s.subgroup,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    messageCount: s.messages.length,
    messages: s.messages.map((m) => ({
      id: m.id,
      submissionId: m.submissionId,
      senderId: m.senderId,
      senderName: m.sender.fullName || m.sender.name,
      senderRole: m.sender.role,
      body: m.body,
      attachments: Array.isArray(m.attachments)
        ? (m.attachments as unknown as SerializedSubmissionAttachment[])
        : [],
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

// ============================================================================
// RAG hybrid case search (additive section — keep self-contained)
// ============================================================================

const searchIntentSchema = z.object({
  refinedQuery: z
    .string()
    .describe('A concise medical paraphrase of the query, optimized for semantic search.'),
  tags: z
    .array(z.string())
    .describe('Up to ~6 clinical keywords/tags extracted from the query (symptoms, conditions, procedures).'),
  specialty: z
    .string()
    .nullable()
    .describe('The most relevant medical specialty in Russian, or null if unclear.'),
  subgroup: z
    .string()
    .nullable()
    .describe('One of: clinical, sanepid, best_practices, management — or null if unclear.'),
});

type SearchIntent = z.infer<typeof searchIntentSchema>;

const SEARCH_INCLUDE = { images: true, attachments: true } as const;

function normSearch(s: string): string {
  return s.toLowerCase().trim();
}

/**
 * Substring fallback search over name/teaser/primaryCondition/specialty/tags.
 * Used when there is no API key or no embedded cases yet.
 */
async function fallbackSearchCases(query: string): Promise<SerializedCase[]> {
  const q = query.trim();
  const where: Prisma.CaseWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { teaser: { contains: q, mode: 'insensitive' } },
          { primaryCondition: { contains: q, mode: 'insensitive' } },
          { specialty: { contains: q, mode: 'insensitive' } },
          { tags: { hasSome: [q] } },
        ],
      }
    : {};
  const rows = await prisma.case.findMany({
    where,
    include: SEARCH_INCLUDE,
    orderBy: { updatedAt: 'desc' },
    take: 12,
  });
  return rows.map(serializeCase);
}

/**
 * Hybrid RAG search: LLM extracts intent (tags/specialty/subgroup), we embed
 * the refined query, run a pgvector KNN over Case.embedding, then boost rows
 * whose tags/specialty/subgroup overlap the extracted intent. Falls back to a
 * substring search when embeddings or the API key are unavailable.
 */
export async function searchCases(
  query: string,
): Promise<ActionResult<SerializedCase[]>> {
  try {
    await requireUser();
  } catch {
    return fail('Требуется авторизация.');
  }

  const trimmed = query.trim();
  if (!trimmed) return ok([]);

  // No API key → graceful substring fallback.
  if (!process.env.OPENAI_API_KEY) {
    try {
      return ok(await fallbackSearchCases(trimmed));
    } catch (error) {
      console.error('searchCases fallback failed', error);
      return fail('Не удалось выполнить поиск.');
    }
  }

  try {
    // 1. Extract structured intent from the natural-language query.
    let intent: SearchIntent;
    try {
      intent = await runChat(
        searchIntentSchema,
        [
          {
            role: 'system',
            content:
              "You extract structured search intent from a clinician's natural-language query about medical teaching cases. " +
              'Return a refined query suitable for semantic search, relevant clinical tags, and (if clear) a specialty and subgroup. ' +
              'Subgroup must be one of: clinical, sanepid, best_practices, management.',
          },
          { role: 'user', content: trimmed },
        ],
        { schemaName: 'search_intent', temperature: 0.2 },
      );
    } catch (error) {
      console.error('searchCases intent extraction failed, using raw query', error);
      intent = { refinedQuery: trimmed, tags: [], specialty: null, subgroup: null };
    }

    // 2. Embed the refined query.
    const queryVector = await embedText(intent.refinedQuery || trimmed);
    const literal = toVectorLiteral(queryVector);

    // 3. pgvector KNN over embedded cases.
    const knn = await prisma.$queryRaw<Array<{ id: string; distance: number }>>`
      SELECT id, (embedding <=> ${literal}::vector) AS distance
      FROM "Case"
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${literal}::vector
      LIMIT 20
    `;

    // No embedded cases yet → fall back to substring search.
    if (knn.length === 0) {
      return ok(await fallbackSearchCases(trimmed));
    }

    const ids = knn.map((r) => r.id);
    const rows = await prisma.case.findMany({
      where: { id: { in: ids } },
      include: SEARCH_INCLUDE,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));

    // 4. Rank: combine semantic similarity with tag/specialty/subgroup boosts.
    const wantTags = new Set(intent.tags.map(normSearch).filter(Boolean));
    const wantSpecialty = intent.specialty ? normSearch(intent.specialty) : null;
    const wantSubgroup = intent.subgroup ? normSearch(intent.subgroup) : null;

    const scored = knn
      .map((r) => {
        const row = byId.get(r.id);
        if (!row) return null;
        // distance is cosine distance in [0,2]; similarity in roughly [-1,1].
        const similarity = 1 - Number(r.distance);
        let boost = 0;
        if (wantTags.size) {
          const rowTags = new Set((row.tags ?? []).map(normSearch));
          let overlap = 0;
          for (const t of wantTags) if (rowTags.has(t)) overlap += 1;
          boost += overlap * 0.15;
        }
        if (wantSpecialty && row.specialty && normSearch(row.specialty) === wantSpecialty) {
          boost += 0.2;
        }
        if (wantSubgroup && row.subgroup && normSearch(row.subgroup) === wantSubgroup) {
          boost += 0.1;
        }
        return { row, score: similarity + boost };
      })
      .filter((x): x is { row: (typeof rows)[number]; score: number } => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    return ok(scored.map((s) => serializeCase(s.row)));
  } catch (error) {
    console.error('searchCases failed, attempting fallback', error);
    try {
      return ok(await fallbackSearchCases(trimmed));
    } catch (fallbackError) {
      console.error('searchCases fallback also failed', fallbackError);
      return fail('Не удалось выполнить поиск.');
    }
  }
}

// ───────────────────────── Password reset

function resetBaseUrl(): string {
  return process.env.NEXTAUTH_URL?.replace(/\/$/, '') ?? 'http://localhost:3000';
}

/**
 * Issue a password-reset token and email a reset link. The response is the
 * SAME whether or not the email is registered (anti-enumeration). Only
 * existing, admin-approved users actually receive an email.
 */
export async function requestPasswordReset(
  email: string,
): Promise<ActionResult<{ sent: true }>> {
  const parsed = z.string().email().safeParse(email);
  // Malformed email: return the same neutral success (anti-enumeration), not an error.
  if (!parsed.success) return ok({ sent: true });

  const normalized = parsed.data.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });

  if (user && user.approvedAt) {
    const now = new Date();
    const recent = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    const throttled =
      !!recent && recent.expiresAt > now && isWithinResendCooldown(recent.createdAt, now);

    if (!throttled) {
      const rawToken = generateResetToken();
      // Invalidate any outstanding tokens and issue a fresh one atomically, so
      // concurrent requests can't leave two simultaneously-valid tokens.
      await prisma.$transaction([
        prisma.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: now },
        }),
        prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashResetToken(rawToken),
            expiresAt: resetTokenExpiry(now),
          },
        }),
      ]);

      const resetUrl = `${resetBaseUrl()}/reset-password?token=${rawToken}`;
      const { subject, html, text } = buildPasswordResetEmail(resetUrl);
      try {
        await sendEmail({ to: normalized, subject, html, text });
      } catch (error) {
        // Don't leak delivery failures to the client; log for ops.
        console.error('Failed to send password reset email:', error);
      }
    }
  }

  return ok({ sent: true });
}

/** Lightweight check so the reset page can show "link expired" before input. */
export async function checkResetToken(token: string): Promise<{ valid: boolean }> {
  if (!token) return { valid: false };
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
  });
  if (!record) return { valid: false };
  return { valid: isResetTokenUsable(record, new Date()) };
}

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(6),
});

export async function resetPassword(
  input: z.infer<typeof resetPasswordSchema>,
): Promise<ActionResult<{ id: string }>> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return fail('Пароль должен быть не короче 6 символов.');

  const now = new Date();
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(parsed.data.token) },
  });
  if (!record || !isResetTokenUsable(record, now)) {
    return fail('Ссылка устарела или недействительна. Запросите восстановление заново.');
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: now } }),
    prisma.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: now },
    }),
  ]);

  return ok({ id: record.userId });
}

// ───────────────────────── Landing contact form

const contactMessageSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  message: z.string().trim().min(1).max(2000),
  company: z.string().optional(), // honeypot — real users never fill this
});

/**
 * Send a contact-form message to the site inbox. Bots that fill the hidden
 * `company` honeypot field are silently accepted but dropped (no email),
 * so we don't reveal the trap.
 */
export async function sendContactMessage(
  input: z.infer<typeof contactMessageSchema>,
): Promise<ActionResult<{ sent: true }>> {
  const parsed = contactMessageSchema.safeParse(input);
  if (!parsed.success) return fail('Проверьте правильность заполнения формы.');

  const { name, email, message, company } = parsed.data;
  if (company && company.trim().length > 0) return ok({ sent: true });

  const { subject, html, text } = buildContactEmail({ name, email, message });
  try {
    await sendEmail({ to: SITE_EMAIL, subject, html, text, replyTo: email });
  } catch (error) {
    console.error('Failed to send contact message:', error);
    return fail('Не удалось отправить сообщение. Попробуйте позже.');
  }

  return ok({ sent: true });
}
