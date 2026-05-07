'use server';

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { CaseMode as PrismaCaseMode, Prisma, Role } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, requireUser, requireAdmin } from '@/lib/session';
import { analyzeStudentQuestion, AnalyzeStudentQuestionInput } from '@/ai/flows/analyze-student-question';
import { generatePersonalizedScenario, GeneratePersonalizedScenarioInput } from '@/ai/flows/generate-personalized-scenario';
import { simulateComorbidities, SimulateComorbiditiesInput } from '@/ai/flows/simulate-comorbidities';
import { savePatientRecord } from '@/services/patient-record';
import { deleteAttachmentFile } from '@/lib/storage';
import {
  runCaseChat,
  runIntroMessage,
  type CaseChatInput,
} from '@/ai/flows/case-chat-flow';
import {
  structureCaseFromMarkdown,
  structureCaseInputSchema,
} from '@/ai/flows/structure-case-from-markdown';
import {
  CASE_MODES,
  EMPTY_BODY,
  caseBodySchema,
  caseSolutionSchema,
  chatHistorySchema,
  expectedSolutionKind,
  type CaseBody,
  type CaseMode,
  type CaseSolution,
  type ChatEvaluation,
  type ChatHistory,
  type ChatHistoryMessage,
  type ChatPhase,
  type ChatResponse,
} from '@/lib/case-schema';

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
  consentAccepted: z.boolean().optional(),
  role: z.enum(['ADMIN', 'DOCTOR', 'PATIENT']).optional(),
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
      role: (data.role as Role) ?? 'DOCTOR',
      consentAcceptedAt: data.consentAccepted ? new Date() : null,
      avatar: `https://i.pravatar.cc/150?u=${encodeURIComponent(data.email.toLowerCase())}`,
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
  avatar: z.string().optional().nullable(),
  profilePhotoUrl: z.string().optional().nullable(),
  medicalRecords: z.string().optional().nullable(),
  patientIds: z.array(z.string()).optional(),
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

export async function updateUserStatistics(
  caseId: string,
  result: 'solved' | 'unsolved'
): Promise<ActionResult<{ solvedCount: number; unsolvedCount: number }>> {
  const user = await requireUserSafe();
  if (!user) return fail('Требуется авторизация.');

  const solvedSet = new Set(user.solvedCaseIds);
  const unsolvedSet = new Set(user.unsolvedCaseIds);

  if (result === 'solved') {
    solvedSet.add(caseId);
    unsolvedSet.delete(caseId);
  } else {
    unsolvedSet.add(caseId);
    solvedSet.delete(caseId);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      solvedCaseIds: Array.from(solvedSet),
      unsolvedCaseIds: Array.from(unsolvedSet),
    },
    select: { solvedCaseIds: true, unsolvedCaseIds: true },
  });

  return ok({
    solvedCount: updated.solvedCaseIds.length,
    unsolvedCount: updated.unsolvedCaseIds.length,
  });
}

// ───────────────────────── Cases

const caseModeEnumSchema = z.enum(CASE_MODES);

const caseInputSchema = z.object({
  name: z.string().min(1),
  age: z.coerce.number().int().optional().nullable(),
  gender: z.string().optional().nullable(),
  primaryCondition: z.string().optional().nullable(),
  history: z.string().optional().nullable(),
  scenarioDescription: z.string().optional().nullable(),
  learningObjectives: z.array(z.string()).optional(),
  comorbidities: z.string().optional().nullable(),
  subgroup: z.string().optional().nullable(),
  specialty: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  teaser: z.string().optional().nullable(),
  mode: caseModeEnumSchema.optional(),
  body: caseBodySchema.optional(),
  solution: caseSolutionSchema.nullable().optional(),
  taskQuestions: z.array(z.string()).optional(),
  imageIds: z.array(z.string()).optional(),
  imageFilenames: z.array(z.object({ filename: z.string(), mimeType: z.string() })).optional(),
  attachmentIds: z.array(z.string()).optional(),
});

export type CaseInput = z.infer<typeof caseInputSchema>;

function validateSolutionForMode(solution: CaseSolution | null | undefined, mode: CaseMode): string | null {
  if (!solution) return null;
  const expected = expectedSolutionKind(mode);
  if (solution.kind !== expected) {
    return `Тип «Правильного ответа» не соответствует выбранной подгруппе (ожидалось ${expected}, получено ${solution.kind}).`;
  }
  return null;
}

export async function createCase(input: CaseInput): Promise<ActionResult<SerializedCase>> {
  let author;
  try {
    author = await requireAdmin();
  } catch {
    return fail('Создавать кейсы может только администратор.');
  }

  const parsed = caseInputSchema.safeParse(input);
  if (!parsed.success) return fail('Проверьте правильность заполнения формы кейса.');
  const data = parsed.data;
  const mode = (data.mode ?? 'CLINICAL_QUEST') as CaseMode;
  const solutionError = validateSolutionForMode(data.solution ?? null, mode);
  if (solutionError) return fail(solutionError);

  const created = await prisma.case.create({
    data: {
      authorId: author.id,
      name: data.name,
      age: data.age ?? null,
      gender: data.gender ?? null,
      primaryCondition: data.primaryCondition ?? null,
      history: data.history ?? null,
      scenarioDescription: data.scenarioDescription ?? null,
      learningObjectives: data.learningObjectives ?? [],
      comorbidities: data.comorbidities ?? null,
      subgroup: data.subgroup ?? null,
      specialty: data.specialty ?? null,
      tags: data.tags ?? [],
      teaser: data.teaser ?? null,
      mode: mode as PrismaCaseMode,
      body: (data.body ?? EMPTY_BODY) as Prisma.InputJsonValue,
      solution: (data.solution ?? null) as Prisma.InputJsonValue | undefined,
      taskQuestions: data.taskQuestions ?? [],
      images: data.imageFilenames && data.imageFilenames.length
        ? {
            create: data.imageFilenames.map((img, order) => ({
              filename: img.filename,
              mimeType: img.mimeType,
              order,
            })),
          }
        : undefined,
    },
    include: { images: true, attachments: true },
  });

  if (data.attachmentIds && data.attachmentIds.length) {
    await prisma.caseAttachment.updateMany({
      where: { id: { in: data.attachmentIds }, caseId: null },
      data: { caseId: created.id },
    });
  }

  const refreshed = await prisma.case.findUnique({
    where: { id: created.id },
    include: { images: true, attachments: { orderBy: { createdAt: 'asc' } } },
  });

  revalidatePath('/');
  revalidatePath('/cases/[subgroup]', 'page');
  return ok(serializeCase(refreshed!));
}

const updateCaseSchema = caseInputSchema.partial().extend({ id: z.string() });

export async function updateCase(input: z.infer<typeof updateCaseSchema>): Promise<ActionResult<SerializedCase>> {
  try {
    await requireUser();
  } catch {
    return fail('Требуется авторизация.');
  }

  const parsed = updateCaseSchema.safeParse(input);
  if (!parsed.success) return fail('Некорректные данные кейса.');
  const {
    id,
    imageFilenames,
    imageIds: _discardImageIds,
    attachmentIds,
    body,
    solution,
    mode,
    ...rest
  } = parsed.data;

  if (mode && solution !== undefined && solution !== null) {
    const err = validateSolutionForMode(solution, mode);
    if (err) return fail(err);
  }

  const updateData: Prisma.CaseUpdateInput = { ...(rest as Prisma.CaseUpdateInput) };
  if (mode) updateData.mode = mode as PrismaCaseMode;
  if (body) updateData.body = body as Prisma.InputJsonValue;
  if (solution !== undefined) {
    updateData.solution = (solution as Prisma.InputJsonValue) ?? Prisma.JsonNull;
  }

  const updated = await prisma.case.update({
    where: { id },
    data: {
      ...updateData,
      ...(imageFilenames
        ? {
            images: {
              deleteMany: {},
              create: imageFilenames.map((img, order) => ({
                filename: img.filename,
                mimeType: img.mimeType,
                order,
              })),
            },
          }
        : {}),
    },
    include: { images: true, attachments: { orderBy: { createdAt: 'asc' } } },
  });

  if (attachmentIds && attachmentIds.length) {
    await prisma.caseAttachment.updateMany({
      where: { id: { in: attachmentIds }, caseId: null },
      data: { caseId: id },
    });
  }

  revalidatePath('/');
  revalidatePath(`/cases/${updated.subgroup ?? ''}/${id}`);
  return ok(serializeCase(updated));
}

export async function deleteCase(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
  } catch {
    return fail('Удалять кейсы может только администратор.');
  }
  await prisma.case.delete({ where: { id } });
  revalidatePath('/');
  return ok({ id });
}

export async function getCases(filters?: { subgroup?: string; specialty?: string }): Promise<ActionResult<SerializedCase[]>> {
  try {
    await requireUser();
  } catch {
    return fail('Требуется авторизация.');
  }
  const where: Prisma.CaseWhereInput = {};
  if (filters?.subgroup) where.subgroup = filters.subgroup;
  if (filters?.specialty) where.specialty = filters.specialty;
  const cases = await prisma.case.findMany({
    where,
    include: {
      images: { orderBy: { order: 'asc' } },
      attachments: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return ok(cases.map(serializeCase));
}

export async function getCaseById(id: string): Promise<ActionResult<SerializedCase>> {
  try {
    await requireUser();
  } catch {
    return fail('Требуется авторизация.');
  }
  const c = await prisma.case.findUnique({
    where: { id },
    include: {
      images: { orderBy: { order: 'asc' } },
      attachments: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!c) return fail('Кейс не найден.');
  return ok(serializeCase(c));
}

// ───────────────────────── Case chat (OpenAI)

const handleCaseChatSchema = z.object({
  caseId: z.string(),
  userMessage: z.string().min(1),
  submittingFinalAnswer: z.boolean().optional(),
});

export type HandleCaseChatResult = {
  reply: ChatHistoryMessage;
  phase: ChatPhase;
  evaluation: ChatEvaluation | null;
  finalAnswer: string | null;
};

export async function handleCaseChat(
  input: z.infer<typeof handleCaseChatSchema>,
): Promise<ActionResult<HandleCaseChatResult>> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return fail('Требуется авторизация.');
  }
  const parsed = handleCaseChatSchema.safeParse(input);
  if (!parsed.success) return fail('Некорректное сообщение чата.');

  const c = await prisma.case.findUnique({
    where: { id: parsed.data.caseId },
    select: {
      id: true,
      name: true,
      specialty: true,
      mode: true,
      body: true,
      solution: true,
      taskQuestions: true,
    },
  });
  if (!c) return fail('Кейс не найден.');

  const session = await prisma.chatSession.upsert({
    where: { userId_caseId: { userId: user.id, caseId: c.id } },
    create: {
      userId: user.id,
      caseId: c.id,
      messages: [] as unknown as Prisma.InputJsonValue,
    },
    update: {},
  });

  const historyParse = chatHistorySchema.safeParse(session.messages);
  const history: ChatHistory = historyParse.success ? historyParse.data : [];
  const solutionParse = c.solution ? caseSolutionSchema.safeParse(c.solution) : null;
  const solution: CaseSolution | null = solutionParse?.success ? solutionParse.data : null;

  const flowInput: CaseChatInput = {
    caseMode: c.mode as CaseMode,
    caseName: c.name,
    caseSpecialty: c.specialty,
    caseBodyText: caseBodyToText(c.body),
    taskQuestions: c.taskQuestions,
    solution,
    history,
    userMessage: parsed.data.userMessage,
    submittingFinalAnswer: parsed.data.submittingFinalAnswer,
  };

  let response: ChatResponse;
  try {
    response = await runCaseChat(flowInput);
  } catch (error) {
    console.error('[handleCaseChat] OpenAI error', error);
    return fail('Не удалось получить ответ от ИИ. Проверьте OPENAI_API_KEY и повторите попытку.');
  }

  const now = new Date().toISOString();
  const userMessage: ChatHistoryMessage = {
    role: 'user',
    content: parsed.data.userMessage,
    createdAt: now,
    isFinalAnswer: parsed.data.submittingFinalAnswer || undefined,
  };
  const assistantMessage: ChatHistoryMessage = {
    role: 'assistant',
    content: response.reply,
    createdAt: new Date().toISOString(),
    suggestedActions: response.suggestedActions,
    evaluation: response.evaluation ?? undefined,
  };

  const newHistory: ChatHistory = [...history, userMessage, assistantMessage];
  const finalAnswer = parsed.data.submittingFinalAnswer
    ? parsed.data.userMessage
    : session.finalAnswer;
  const phase: ChatPhase = parsed.data.submittingFinalAnswer ? 'done' : response.phase;

  await prisma.chatSession.update({
    where: { id: session.id },
    data: {
      messages: newHistory as unknown as Prisma.InputJsonValue,
      phase,
      finalAnswer,
      evaluation: (response.evaluation ?? null) as Prisma.InputJsonValue | undefined,
      completedAt: phase === 'done' ? new Date() : null,
    },
  });

  return ok({
    reply: assistantMessage,
    phase,
    evaluation: response.evaluation ?? null,
    finalAnswer: finalAnswer ?? null,
  });
}

export type SerializedChatSession = {
  id: string;
  caseId: string;
  phase: ChatPhase;
  messages: ChatHistory;
  finalAnswer: string | null;
  evaluation: ChatEvaluation | null;
  completedAt: string | null;
};

export async function getChatSession(caseId: string): Promise<ActionResult<SerializedChatSession | null>> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return fail('Требуется авторизация.');
  }
  const session = await prisma.chatSession.findUnique({
    where: { userId_caseId: { userId: user.id, caseId } },
  });
  if (!session) return ok(null);

  const historyParse = chatHistorySchema.safeParse(session.messages);
  const history: ChatHistory = historyParse.success ? historyParse.data : [];
  const evaluation = session.evaluation
    ? (session.evaluation as unknown as ChatEvaluation)
    : null;

  return ok({
    id: session.id,
    caseId: session.caseId,
    phase: session.phase as ChatPhase,
    messages: history,
    finalAnswer: session.finalAnswer,
    evaluation,
    completedAt: session.completedAt ? session.completedAt.toISOString() : null,
  });
}

export async function resetChatSession(caseId: string): Promise<ActionResult<{ id: string | null }>> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return fail('Требуется авторизация.');
  }
  const deleted = await prisma.chatSession.deleteMany({
    where: { userId: user.id, caseId },
  });
  return ok({ id: deleted.count > 0 ? caseId : null });
}

export async function startCaseChat(caseId: string): Promise<ActionResult<HandleCaseChatResult>> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return fail('Требуется авторизация.');
  }
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      name: true,
      specialty: true,
      mode: true,
      body: true,
      solution: true,
      taskQuestions: true,
    },
  });
  if (!c) return fail('Кейс не найден.');

  const existing = await prisma.chatSession.findUnique({
    where: { userId_caseId: { userId: user.id, caseId: c.id } },
  });
  if (existing) {
    const historyParse = chatHistorySchema.safeParse(existing.messages);
    const last = historyParse.success ? historyParse.data.at(-1) : null;
    if (last) {
      return ok({
        reply: last,
        phase: existing.phase as ChatPhase,
        evaluation: existing.evaluation as unknown as ChatEvaluation | null,
        finalAnswer: existing.finalAnswer,
      });
    }
  }

  const solutionParse = c.solution ? caseSolutionSchema.safeParse(c.solution) : null;
  const solution: CaseSolution | null = solutionParse?.success ? solutionParse.data : null;

  let response: ChatResponse;
  try {
    response = await runIntroMessage({
      caseMode: c.mode as CaseMode,
      caseName: c.name,
      caseSpecialty: c.specialty,
      caseBodyText: caseBodyToText(c.body),
      taskQuestions: c.taskQuestions,
      solution,
    });
  } catch (error) {
    console.error('[startCaseChat] OpenAI error', error);
    return fail('Не удалось запустить чат: проверьте OPENAI_API_KEY.');
  }

  const intro: ChatHistoryMessage = {
    role: 'assistant',
    content: response.reply,
    createdAt: new Date().toISOString(),
    suggestedActions: response.suggestedActions,
  };

  await prisma.chatSession.upsert({
    where: { userId_caseId: { userId: user.id, caseId: c.id } },
    create: {
      userId: user.id,
      caseId: c.id,
      phase: response.phase,
      messages: [intro] as unknown as Prisma.InputJsonValue,
    },
    update: {
      messages: [intro] as unknown as Prisma.InputJsonValue,
      phase: response.phase,
      finalAnswer: null,
      evaluation: Prisma.JsonNull,
      completedAt: null,
    },
  });

  return ok({
    reply: intro,
    phase: response.phase,
    evaluation: response.evaluation ?? null,
    finalAnswer: null,
  });
}

export async function getCaseSolution(
  caseId: string,
): Promise<ActionResult<{ solution: CaseSolution | null; available: boolean }>> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return fail('Требуется авторизация.');
  }
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: { solution: true },
  });
  if (!c) return fail('Кейс не найден.');

  if (user.role === 'ADMIN') {
    const parsed = c.solution ? caseSolutionSchema.safeParse(c.solution) : null;
    return ok({ solution: parsed?.success ? parsed.data : null, available: true });
  }

  const session = await prisma.chatSession.findUnique({
    where: { userId_caseId: { userId: user.id, caseId } },
    select: { phase: true },
  });
  if (!session || session.phase !== 'done') {
    return ok({ solution: null, available: false });
  }
  const parsed = c.solution ? caseSolutionSchema.safeParse(c.solution) : null;
  return ok({ solution: parsed?.success ? parsed.data : null, available: true });
}

// ───────────────────────── Case attachments (admin)

const updateAttachmentSchema = z.object({
  id: z.string(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  order: z.number().int().optional(),
});

export async function updateCaseAttachment(
  input: z.infer<typeof updateAttachmentSchema>,
): Promise<ActionResult<SerializedCaseAttachment>> {
  try {
    await requireAdmin();
  } catch {
    return fail('Редактировать вложения может только администратор.');
  }
  const parsed = updateAttachmentSchema.safeParse(input);
  if (!parsed.success) return fail('Некорректные данные вложения.');

  const data: Prisma.CaseAttachmentUpdateInput = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title?.trim() || null;
  if (parsed.data.description !== undefined) data.description = parsed.data.description?.trim() || null;
  if (parsed.data.order !== undefined) data.order = parsed.data.order;

  const updated = await prisma.caseAttachment.update({
    where: { id: parsed.data.id },
    data,
  });

  return ok({
    id: updated.id,
    filename: updated.filename,
    originalName: updated.originalName,
    title: updated.title,
    description: updated.description,
    mimeType: updated.mimeType,
    size: updated.size,
    kind: updated.kind,
    order: updated.order,
    url: `/api/attachments/${updated.filename}`,
    createdAt: updated.createdAt.toISOString(),
  });
}

export async function deleteCaseAttachment(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
  } catch {
    return fail('Удалять вложения может только администратор.');
  }
  const existing = await prisma.caseAttachment.findUnique({ where: { id } });
  if (!existing) return fail('Вложение не найдено.');

  await prisma.caseAttachment.delete({ where: { id } });
  await deleteAttachmentFile(existing.filename);
  return ok({ id });
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
  const items = await prisma.newsItem.findMany({ orderBy: { date: 'desc' } });
  return ok(items.map((n) => ({ id: n.id, title: n.title, body: n.body, date: n.date.toISOString() })));
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
  avatar: string | null;
  profilePhotoUrl: string | null;
  consentAcceptedAt: string | null;
  approvedAt: string | null;
  solvedCaseIds: string[];
  unsolvedCaseIds: string[];
  medicalRecords: string | null;
  patientIds: string[];
  createdAt: string;
};

export type SerializedCaseImage = {
  id: string;
  filename: string;
  mimeType: string;
  order: number;
  url: string;
};

export type SerializedCaseAttachment = {
  id: string;
  filename: string;
  originalName: string | null;
  title: string | null;
  description: string | null;
  mimeType: string;
  size: number;
  kind: string;
  order: number;
  url: string;
  createdAt: string;
};

export type SerializedCase = {
  id: string;
  authorId: string;
  name: string;
  age: number | null;
  gender: string | null;
  primaryCondition: string | null;
  history: string | null;
  scenarioDescription: string | null;
  learningObjectives: string[];
  comorbidities: string | null;
  subgroup: string | null;
  specialty: string | null;
  tags: string[];
  teaser: string | null;
  mode: CaseMode;
  body: CaseBody;
  taskQuestions: string[];
  hasSolution: boolean;
  images: SerializedCaseImage[];
  attachments: SerializedCaseAttachment[];
  createdAt: string;
  updatedAt: string;
};

type PrismaUser = Awaited<ReturnType<typeof prisma.user.findFirst>>;
type PrismaCaseFull = Prisma.CaseGetPayload<{ include: { images: true; attachments: true } }>;

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
    avatar: u.avatar,
    profilePhotoUrl: u.profilePhotoUrl,
    consentAcceptedAt: u.consentAcceptedAt ? u.consentAcceptedAt.toISOString() : null,
    approvedAt: u.approvedAt ? u.approvedAt.toISOString() : null,
    solvedCaseIds: u.solvedCaseIds,
    unsolvedCaseIds: u.unsolvedCaseIds,
    medicalRecords: u.medicalRecords,
    patientIds: u.patientIds,
    createdAt: u.createdAt.toISOString(),
  };
}

function serializeCase(c: PrismaCaseFull): SerializedCase {
  const bodyParse = caseBodySchema.safeParse(c.body);
  const body: CaseBody = bodyParse.success ? bodyParse.data : EMPTY_BODY;

  return {
    id: c.id,
    authorId: c.authorId,
    name: c.name,
    age: c.age,
    gender: c.gender,
    primaryCondition: c.primaryCondition,
    history: c.history,
    scenarioDescription: c.scenarioDescription,
    learningObjectives: c.learningObjectives,
    comorbidities: c.comorbidities,
    subgroup: c.subgroup,
    specialty: c.specialty,
    tags: c.tags,
    teaser: c.teaser,
    mode: c.mode as CaseMode,
    body,
    taskQuestions: c.taskQuestions,
    hasSolution: c.solution !== null && c.solution !== undefined,
    images: c.images.map((i) => ({
      id: i.id,
      filename: i.filename,
      mimeType: i.mimeType,
      order: i.order,
      url: `/api/images/${i.filename}`,
    })),
    attachments: c.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      originalName: a.originalName,
      title: a.title,
      description: a.description,
      mimeType: a.mimeType,
      size: a.size,
      kind: a.kind,
      order: a.order,
      url: `/api/attachments/${a.filename}`,
      createdAt: a.createdAt.toISOString(),
    })),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
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
