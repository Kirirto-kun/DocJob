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
//
// Pure domain logic (validation, auth rules, bcrypt hashing, Prisma calls)
// lives in @docjob/core's user.service — these are thin transport wrappers:
// resolve the actor, call core, translate thrown DomainErrors back into
// ActionResult, and run the Next.js-specific side effects (revalidatePath)
// that can't live in a transport-agnostic package. Session-reading stays in
// web (getActor / lib/session); core never touches cookies.

export async function registerUser(
  input: core.users.RegisterUserInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const data = await core.users.registerUser(input);
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function updateUser(
  input: core.users.UpdateUserInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await getActor();
    const data = await core.users.updateUser(actor, input);
    revalidatePath('/');
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function getUsers(): Promise<ActionResult<SerializedUser[]>> {
  try {
    const actor = await getActor();
    const data = await core.users.listUsers(actor);
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

// ───────────────────────── Registration approval (admin)

export async function getPendingUsers(): Promise<ActionResult<SerializedUser[]>> {
  try {
    const actor = await getActor();
    const data = await core.users.listPendingUsers(actor);
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function approveUser(userId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await getActor();
    const data = await core.users.approveUser(actor, userId);
    revalidatePath('/admin/pending');
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
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
  return core.users.checkLoginIssue(email, password);
}

export async function rejectUser(userId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await getActor();
    const data = await core.users.rejectUser(actor, userId);
    revalidatePath('/admin/pending');
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

/**
 * Permanently delete a user — revokes their access to the platform entirely.
 * Cascades remove their authored cases, chat sessions, saved cases, reviews and
 * submissions (see onDelete: Cascade in the schema). Admin-only; an admin
 * cannot delete their own account.
 */
export async function deleteUser(userId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await getActor();
    const data = await core.users.deleteUser(actor, userId);
    revalidatePath('/admin/users');
    revalidatePath('/admin/pending');
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
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
    void core.search.upsertCaseEmbedding(data.id).catch(() => {});
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
    void core.search.upsertCaseEmbedding(data.id).catch(() => {});
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
    const actor = await getActor();
    const data = await core.tags.getTags(actor);
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function addTag(label: string): Promise<ActionResult<{ label: string }>> {
  try {
    const actor = await getActor();
    const data = await core.tags.addTag(actor, label);
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
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
  const actor = await getActor();
  return actor ? core.users.getUserById(actor.id) : null;
}

// ───────────────────────── Saved cases (favourites / bookmarks)

export type SerializedSavedCase = core.saved.SerializedSavedCase;

export async function toggleSavedCase(
  caseId: string,
): Promise<ActionResult<{ saved: boolean }>> {
  try {
    const actor = await getActor();
    const data = await core.saved.toggleSavedCase(actor, caseId);
    revalidatePath('/saved-cases');
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function isCaseSaved(caseId: string): Promise<ActionResult<{ saved: boolean }>> {
  try {
    const actor = await getActor();
    const data = await core.saved.isCaseSaved(actor, caseId);
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function getSavedCases(): Promise<ActionResult<SerializedSavedCase[]>> {
  try {
    const actor = await getActor();
    const data = await core.saved.getSavedCases(actor);
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function getSavedCaseIds(): Promise<ActionResult<string[]>> {
  try {
    const actor = await getActor();
    const data = await core.saved.getSavedCaseIds(actor);
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

// ───────────────────────── Reviews

export type SerializedReview = core.SerializedReview;
export type SerializedReviewWithCase = core.SerializedReviewWithCase;

export async function createReview(
  input: core.reviews.CreateReviewInput,
): Promise<ActionResult<SerializedReview>> {
  try {
    const actor = await getActor();
    const data = await core.reviews.createReview(actor, input);
    revalidatePath(`/cases`);
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function deleteReview(reviewId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await getActor();
    const data = await core.reviews.deleteReview(actor, reviewId);
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function getReviewsForCase(caseId: string): Promise<ActionResult<SerializedReview[]>> {
  try {
    const actor = await getActor();
    const data = await core.reviews.getReviewsForCase(actor, caseId);
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function getMyReviews(): Promise<ActionResult<SerializedReviewWithCase[]>> {
  try {
    const actor = await getActor();
    const data = await core.reviews.getMyReviews(actor);
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

// ───────────────────────── Case submissions (author -> admin discussion)
//
// Pure domain logic (validation, auth rules, message-thread persistence,
// status workflow) lives in @docjob/core's submission.service — these are
// thin transport wrappers: resolve the actor, call core, translate thrown
// DomainErrors back into ActionResult, and run the Next.js-specific side
// effects (revalidatePath).

export type SerializedSubmissionAttachment = core.SerializedSubmissionAttachment;
export type SerializedSubmissionMessage = core.SerializedSubmissionMessage;
export type SerializedCaseSubmission = core.SerializedCaseSubmission;

export async function createCaseSubmission(
  input: core.submissions.CreateCaseSubmissionInput,
): Promise<ActionResult<SerializedCaseSubmission>> {
  try {
    const actor = await getActor();
    const data = await core.submissions.createCaseSubmission(actor, input);
    revalidatePath('/admin/case-submissions');
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function sendCaseSubmissionMessage(
  input: core.submissions.SendCaseSubmissionMessageInput,
): Promise<ActionResult<SerializedSubmissionMessage>> {
  try {
    const actor = await getActor();
    const data = await core.submissions.sendCaseSubmissionMessage(actor, input);
    revalidatePath('/admin/case-submissions');
    revalidatePath('/suggest-case');
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function getMyCaseSubmissions(): Promise<ActionResult<SerializedCaseSubmission[]>> {
  try {
    const actor = await getActor();
    const data = await core.submissions.getMyCaseSubmissions(actor);
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function getAllCaseSubmissions(): Promise<ActionResult<SerializedCaseSubmission[]>> {
  try {
    const actor = await getActor();
    const data = await core.submissions.getAllCaseSubmissions(actor);
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function getCaseSubmissionById(id: string): Promise<ActionResult<SerializedCaseSubmission>> {
  try {
    const actor = await getActor();
    const data = await core.submissions.getCaseSubmissionById(actor, id);
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function updateCaseSubmissionStatus(
  submissionId: string,
  status: core.submissions.CaseSubmissionStatus,
): Promise<ActionResult<{ id: string; status: string }>> {
  try {
    const actor = await getActor();
    const data = await core.submissions.updateCaseSubmissionStatus(actor, submissionId, status);
    revalidatePath('/admin/case-submissions');
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

// ───────────────────────── Search
//
// Pure domain logic (LLM intent extraction, embedding, pgvector KNN,
// substring fallback) lives in @docjob/core's search.service — this is a
// thin transport wrapper: resolve the actor, call core, translate thrown
// DomainErrors back into ActionResult.

export async function searchCases(query: string): Promise<ActionResult<SerializedCase[]>> {
  try {
    const actor = await getActor();
    const data = await core.search.searchCases(actor, query);
    return ok(data);
  } catch (e) {
    return toActionResult(e);
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
  // Core does the token bookkeeping and returns null for malformed / unknown /
  // unapproved / throttled (anti-enumeration: the client sees the same neutral
  // success either way). Email delivery is a transport concern and stays here.
  const issued = await core.users.requestPasswordReset(email);
  if (issued) {
    const resetUrl = `${resetBaseUrl()}/reset-password?token=${issued.rawToken}`;
    const { subject, html, text } = buildPasswordResetEmail(resetUrl);
    try {
      await sendEmail({ to: issued.to, subject, html, text });
    } catch (error) {
      // Don't leak delivery failures to the client; log for ops.
      console.error('Failed to send password reset email:', error);
    }
  }

  return ok({ sent: true });
}

/** Lightweight check so the reset page can show "link expired" before input. */
export async function checkResetToken(token: string): Promise<{ valid: boolean }> {
  return core.users.checkResetToken(token);
}

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(6),
});

export async function resetPassword(
  input: z.infer<typeof resetPasswordSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const data = await core.users.resetPassword(input.token, input.newPassword);
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
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
