'use server';

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { Prisma, Role } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, requireUser, requireAdmin } from '@/lib/session';
import { analyzeStudentQuestion, AnalyzeStudentQuestionInput } from '@/ai/flows/analyze-student-question';
import { generatePersonalizedScenario, GeneratePersonalizedScenarioInput } from '@/ai/flows/generate-personalized-scenario';
import { simulateComorbidities, SimulateComorbiditiesInput } from '@/ai/flows/simulate-comorbidities';
import { savePatientRecord } from '@/services/patient-record';

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

// Public self-registration. Role is hard-coded to DOCTOR — public callers
// cannot escalate to ADMIN even by crafting a direct POST.
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
});

async function createUserInternal(
  data: z.infer<typeof registerSchema>,
  role: Role
): Promise<ActionResult<{ id: string }>> {
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
      role,
      consentAcceptedAt: data.consentAccepted ? new Date() : null,
      avatar: `https://i.pravatar.cc/150?u=${encodeURIComponent(data.email.toLowerCase())}`,
    },
    select: { id: true },
  });
  return ok({ id: created.id });
}

export async function registerUser(input: z.infer<typeof registerSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return fail('Проверьте правильность заполнения формы.');
  return createUserInternal(parsed.data, 'DOCTOR');
}

// Admin-only: used by /add-doctor and any future admin-driven user provisioning.
const createUserByAdminSchema = registerSchema.extend({
  role: z.enum(['ADMIN', 'DOCTOR', 'PATIENT']).default('DOCTOR'),
});

export async function createUserByAdmin(
  input: z.infer<typeof createUserByAdminSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
  } catch {
    return fail('Создавать пользователей может только администратор.');
  }
  const parsed = createUserByAdminSchema.safeParse(input);
  if (!parsed.success) return fail('Проверьте правильность заполнения формы.');
  const { role, ...rest } = parsed.data;
  return createUserInternal(rest, role);
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
  imageIds: z.array(z.string()).optional(),
  imageFilenames: z.array(z.object({ filename: z.string(), mimeType: z.string() })).optional(),
});

export type CaseInput = z.infer<typeof caseInputSchema>;

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
    include: { images: true },
  });

  revalidatePath('/');
  revalidatePath('/cases/[subgroup]', 'page');
  return ok(serializeCase(created));
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
  const { id, imageFilenames, imageIds: _discard, ...rest } = parsed.data;

  const updated = await prisma.case.update({
    where: { id },
    data: {
      ...rest,
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
    include: { images: true },
  });

  revalidatePath('/');
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
    include: { images: { orderBy: { order: 'asc' } } },
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
    include: { images: { orderBy: { order: 'asc' } } },
  });
  if (!c) return fail('Кейс не найден.');
  return ok(serializeCase(c));
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
  solvedCaseIds: string[];
  unsolvedCaseIds: string[];
  medicalRecords: string | null;
  patientIds: string[];
};

export type SerializedCaseImage = {
  id: string;
  filename: string;
  mimeType: string;
  order: number;
  url: string;
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
  images: SerializedCaseImage[];
  createdAt: string;
  updatedAt: string;
};

type PrismaUser = Awaited<ReturnType<typeof prisma.user.findFirst>>;
type PrismaCaseWithImages = Prisma.CaseGetPayload<{ include: { images: true } }>;

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
    solvedCaseIds: u.solvedCaseIds,
    unsolvedCaseIds: u.unsolvedCaseIds,
    medicalRecords: u.medicalRecords,
    patientIds: u.patientIds,
  };
}

function serializeCase(c: PrismaCaseWithImages): SerializedCase {
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
    images: c.images.map((i) => ({
      id: i.id,
      filename: i.filename,
      mimeType: i.mimeType,
      order: i.order,
      url: `/api/images/${i.filename}`,
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
