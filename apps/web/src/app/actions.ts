'use server';

import { z } from 'zod';
import { analyzeStudentQuestion, AnalyzeStudentQuestionInput } from '@/ai/flows/analyze-student-question';
import { generatePersonalizedScenario, GeneratePersonalizedScenarioInput } from '@/ai/flows/generate-personalized-scenario';
import { simulateComorbidities, SimulateComorbiditiesInput } from '@/ai/flows/simulate-comorbidities';
import { savePatientRecord } from '@/services/patient-record';
import { deleteAttachmentFile } from '@/lib/storage';
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
// `registerUser`/`updateUser`/`getUsers` retired (SP-2 Task 5) -> the web
// app now calls `trpc.users.{register,updateProfile,list}` directly; see
// `packages/api/src/routers/users.ts`. `use-user-store.tsx`,
// `register/page.tsx` were the callers.
//
// ───────────────────────── Registration approval (admin)
//
// `getPendingUsers`/`approveUser`/`rejectUser`/`deleteUser` retired (SP-2
// Task 5) -> `admin/pending/page.tsx` and `admin/users/page.tsx` now call
// `trpc.users.{pending,approve,reject,delete}` directly.

// ───────────────────────── Cases
//
// SP-2 Task 3: `createCase`/`updateCase`/`deleteCase`/`getCases`/
// `getCasesPaged`/`getCaseById`/`updateCaseAttachment`/`searchCases` were
// retired here — every caller now goes through `trpc.cases.*`/
// `trpc.search.search` (client components) or `serverCaller().cases.*`
// (Server Components), see `packages/api/src/routers/cases.ts` /
// `search.ts`. The fire-and-forget embedding upsert `createCase`/
// `updateCase` used to do post-write moved into the tRPC router's
// `create`/`update` mutations so it's not duplicated per web call site.
//
// `deleteCaseAttachment` stays here (not migrated) because it has a
// Next.js/filesystem side effect — deleting the file from `UPLOAD_DIR` via
// `@/lib/storage`'s `deleteAttachmentFile` — that `@docjob/core`/
// `@docjob/api` can't perform (no filesystem access, same reasoning as the
// `MediaStorage` scaffold not being wired in yet). Same pattern SP-2 Task 5
// uses for `sendContactMessage` (kept on the action for email delivery).
//
// The `SerializedCase`/`SerializedCaseImage`/`SerializedCaseAttachment` type
// aliases further down this file stay — they're pure type re-exports (not
// actions) still imported by several non-migrated files
// (`case-info-panel.tsx`, `case-page-client.tsx`, etc.) via
// `import type { SerializedCase } from '@/app/actions'`.

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

// ───────────────────────── Tags
//
// `getTags`/`addTag` retired (SP-2 Task 4) — `use-tag-store.tsx` now calls
// `trpc.tags.list`/`trpc.tags.add` directly; see
// `packages/api/src/routers/tags.ts`.

// ───────────────────────── News
//
// `getNews`/`getNewsItem`/`createNews`/`updateNews`/`deleteNews` retired
// (SP-2 Task 5) -> `news-editor.tsx` and `admin/news/*` now call
// `trpc.news.{list,byId,create,update,delete}` directly; see
// `packages/api/src/routers/news.ts`. The public feed itself
// (`@/lib/news.ts#getPublicNewsItems`) still delegates to
// `core.news.listPublicNews` directly (a Server Component read, never went
// through this action file) and is unchanged.

// ═══════════════════════════════════════════════════════════════════════════
// Announcements (admin advertisement popups) — retired (SP-2 Task 5)
// ═══════════════════════════════════════════════════════════════════════════
//
// `getActiveAnnouncements`/`dismissAnnouncement`/`getAnnouncements`/
// `getAnnouncement`/`createAnnouncement`/`updateAnnouncement`/
// `deleteAnnouncement` retired -> `announcement-modal.tsx`,
// `announcement-editor.tsx`, and `admin/announcements/*` now call
// `trpc.announcements.{active,dismiss,list,byId,create,update,delete}`
// directly; see `packages/api/src/routers/announcements.ts`.

// ───────────────────────── Serialization helpers
//
// `SerializedUser` (the hand-rolled type) + `getSessionUser`/`serializeUser`/
// `requireUserSafe` retired alongside the users actions above (SP-2 Task 5)
// — they had no remaining callers once `use-user-store.tsx`/admin pages
// switched to importing `SerializedUser` from `@docjob/core` directly (same
// shape, see `packages/core/src/users/user.mapper.ts`).

// Case-shaped serialized types + serializeCase itself now live in
// @docjob/core (packages/core/src/cases/case.mapper.ts). Re-exported here so
// every existing `import type { SerializedCase } from '@/app/actions'` (and
// friends) across the web app keeps working unchanged.
export type SerializedCaseImage = core.SerializedCaseImage;
export type SerializedCaseAttachment = core.SerializedCaseAttachment;
export type SerializedCase = core.SerializedCase;

// ───────────────────────── Saved cases (favourites / bookmarks)
//
// `toggleSavedCase`/`isCaseSaved`/`getSavedCases`/`getSavedCaseIds` retired
// (SP-2 Task 4) — `save-case-button.tsx`, `saved-cases/page.tsx`,
// `cases/[subgroup]/page.tsx`, and `profile/page.tsx` now call
// `trpc.saved.*` directly; see `packages/api/src/routers/saved.ts`.

// ───────────────────────── Reviews
//
// `createReview`/`deleteReview`/`getReviewsForCase`/`getMyReviews` retired
// (SP-2 Task 4) — `case-reviews-panel.tsx`, `reviewer/my-reviews/page.tsx`,
// and `profile/page.tsx` now call `trpc.reviews.*` directly; see
// `packages/api/src/routers/reviews.ts`.

// ───────────────────────── Case submissions (author -> admin discussion)
//
// `createCaseSubmission`/`sendCaseSubmissionMessage`/`getMyCaseSubmissions`/
// `getAllCaseSubmissions`/`getCaseSubmissionById`/`updateCaseSubmissionStatus`
// retired (SP-2 Task 4) — `suggest-case/page.tsx` and
// `admin/case-submissions/page.tsx` now call `trpc.submissions.*` directly;
// see `packages/api/src/routers/submissions.ts`.

// ───────────────────────── Search
//
// `searchCases` retired (SP-2 Task 3) — `ai-search/page.tsx` now calls
// `trpc.search.search` (`utils.search.search.fetch({ query })`) directly;
// see `packages/api/src/routers/search.ts`.

// ───────────────────────── Password reset

function resetBaseUrl(): string {
  return process.env.AUTH_URL?.replace(/\/$/, '') ?? 'http://localhost:3000';
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
