'use server';

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { Prisma, Role } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma } from '@docjob/db';
import { requireUser } from '@/lib/session';
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
  input: core.cases.StructureCaseInput,
) {
  try {
    const actor = await getActor();
    const draft = await core.cases.structureCaseFromMarkdown(actor, input);
    return ok(draft);
  } catch (e) {
    return toActionResult(e);
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
//
// Pure domain logic (validation, admin gating, CRUD) lives in
// @docjob/core's news.service — these are thin transport wrappers: resolve
// the actor, call core, translate thrown DomainErrors back into
// ActionResult, and run the Next.js-specific side effect (revalidatePath).
// The public feed itself (`getNews`) delegates to the same
// `core.news.listPublicNews` that `@/lib/news.ts#getPublicNewsItems` uses
// directly (that one is imported by Server Components, not this action).

export type SerializedNewsItem = core.SerializedNewsItem;
export type NewsInput = core.news.NewsInput;

function revalidateNewsPaths() {
  revalidatePath('/landing');
  revalidatePath('/news');
  revalidatePath('/admin/news');
}

export async function getNews(): Promise<ActionResult<SerializedNewsItem[]>> {
  try {
    return ok(await core.news.listPublicNews());
  } catch (error) {
    console.error('getNews failed', error);
    return fail('Не удалось загрузить новости.');
  }
}

export async function getNewsItem(id: string): Promise<ActionResult<SerializedNewsItem>> {
  try {
    const actor = await getActor();
    const data = await core.news.getNewsItem(actor, id);
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function createNews(input: NewsInput): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await getActor();
    const data = await core.news.createNews(actor, input);
    revalidateNewsPaths();
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function updateNews(
  id: string,
  input: NewsInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await getActor();
    const data = await core.news.updateNews(actor, id, input);
    revalidateNewsPaths();
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function deleteNews(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await getActor();
    const data = await core.news.deleteNews(actor, id);
    revalidateNewsPaths();
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Announcements (admin advertisement popups)
// ═══════════════════════════════════════════════════════════════════════════
//
// Pure domain logic (validation, admin gating, dismissal bookkeeping) lives
// in @docjob/core's announcement.service — these are thin transport
// wrappers. `getActiveAnnouncements`/`dismissAnnouncement` still resolve the
// actor via `getActor()` (which itself calls `getCurrentUser()`) — behavior
// is unchanged, just routed through the actor shape instead of raw prisma.

export type SerializedAnnouncement = core.SerializedAnnouncement;
export type AnnouncementInput = core.announcements.AnnouncementInput;

function revalidateAnnouncementPaths() {
  revalidatePath('/admin/announcements');
  revalidatePath('/');
}

// --- Public (per logged-in user) ---

export async function getActiveAnnouncements(): Promise<ActionResult<SerializedAnnouncement[]>> {
  try {
    const actor = await getActor();
    const data = await core.announcements.getActiveAnnouncements(actor);
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function dismissAnnouncement(announcementId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await getActor();
    const data = await core.announcements.dismissAnnouncement(actor, announcementId);
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

// --- Admin CRUD ---

export async function getAnnouncements(): Promise<ActionResult<SerializedAnnouncement[]>> {
  try {
    const actor = await getActor();
    const data = await core.announcements.getAnnouncements(actor);
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function getAnnouncement(id: string): Promise<ActionResult<SerializedAnnouncement>> {
  try {
    const actor = await getActor();
    const data = await core.announcements.getAnnouncement(actor, id);
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function createAnnouncement(
  input: AnnouncementInput,
): Promise<ActionResult<SerializedAnnouncement>> {
  try {
    const actor = await getActor();
    const data = await core.announcements.createAnnouncement(actor, input);
    revalidateAnnouncementPaths();
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function updateAnnouncement(
  input: AnnouncementInput & { id: string },
): Promise<ActionResult<SerializedAnnouncement>> {
  try {
    const actor = await getActor();
    const data = await core.announcements.updateAnnouncement(actor, input);
    revalidateAnnouncementPaths();
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function deleteAnnouncement(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await getActor();
    const data = await core.announcements.deleteAnnouncement(actor, id);
    revalidateAnnouncementPaths();
    return ok(data);
  } catch (e) {
    return toActionResult(e);
  }
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
//
// Validation + honeypot logic lives in @docjob/core's contact.service (pure,
// no DB). Building/sending the email is a transport/infra concern (uses the
// `resend` package + env vars) and stays here, same split as
// `requestPasswordReset` above.

export type ContactMessageInput = core.contact.ContactMessageInput;

/**
 * Send a contact-form message to the site inbox. Bots that fill the hidden
 * `company` honeypot field are silently accepted but dropped (no email),
 * so we don't reveal the trap.
 */
export async function sendContactMessage(
  input: ContactMessageInput,
): Promise<ActionResult<{ sent: true }>> {
  let parsed: core.contact.ParsedContactMessage;
  try {
    parsed = core.contact.parseContactMessage(input);
  } catch (e) {
    return toActionResult(e);
  }

  if (parsed.isHoneypot) return ok({ sent: true });

  const { subject, html, text } = buildContactEmail({
    name: parsed.name,
    email: parsed.email,
    message: parsed.message,
  });
  try {
    await sendEmail({ to: SITE_EMAIL, subject, html, text, replyTo: parsed.email });
  } catch (error) {
    console.error('Failed to send contact message:', error);
    return fail('Не удалось отправить сообщение. Попробуйте позже.');
  }

  return ok({ sent: true });
}
