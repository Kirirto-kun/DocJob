import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma, Prisma, Role } from '@docjob/db';
import { assertAdmin, assertApproved, type Actor } from '../shared/actor';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../shared/errors';
import { serializeUser, type SerializedUser } from './user.mapper';
import {
  generateResetToken,
  hashResetToken,
  resetTokenExpiry,
  isResetTokenUsable,
  isWithinResendCooldown,
} from './password-reset-tokens';

// ───────────────────────── Validation schemas (moved verbatim from actions.ts)

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
export type RegisterUserInput = z.infer<typeof registerSchema>;

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
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(6),
});

// ───────────────────────── Registration / profile

/**
 * Public self-registration. NOTE: preserves a pre-existing quirk carried
 * over verbatim from the original `registerUser` server action — there is
 * no server-side check that the caller is an admin before honoring an
 * explicit `role: 'ADMIN' | 'REVIEWER'` in the input. In practice only the
 * admin-only `add-doctor` UI ever sends a non-default role, but nothing
 * *here* enforces that; a caller of this action could self-register as
 * ADMIN. Not fixed in this behavior-preserving refactor — flagged in the
 * task report, same spirit as Task 2's `updateCase` auth-gap note.
 */
export async function registerUser(input: RegisterUserInput): Promise<{ id: string }> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('Проверьте правильность заполнения формы.');
  const data = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) throw new ConflictError('Пользователь с такой почтой уже существует.');

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
  return { id: created.id };
}

/**
 * Update a user's own profile fields, or (if the actor is an admin) another
 * user's. Preserves the original `requireUserSafe()` gate exactly via
 * `assertApproved` — see case.service.ts's `listCases` comment for why that
 * substitution is behavior-preserving (login already requires
 * `approvedAt` to be set).
 */
export async function updateUser(actor: Actor | null, input: UpdateUserInput): Promise<{ id: string }> {
  const current = assertApproved(actor, 'Требуется авторизация.');
  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('Некорректные данные пользователя.');

  if (current.id !== parsed.data.id && current.role !== 'ADMIN') {
    throw new ForbiddenError('Недостаточно прав.');
  }

  const { id, ...rest } = parsed.data;
  const data: Prisma.UserUpdateInput = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined) (data as Record<string, unknown>)[k] = v;
  }
  await prisma.user.update({ where: { id }, data });
  return { id };
}

/** List all users, newest-last. Requires any logged-in (approved) actor. */
export async function listUsers(actor: Actor | null): Promise<SerializedUser[]> {
  assertApproved(actor, 'Требуется авторизация.');
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
  return users.map(serializeUser);
}

/**
 * Fetch a user by id and serialize it, or `null` if not found. No auth
 * check here — callers (e.g. the `getSessionUser` web wrapper, which reads
 * the session itself) are responsible for resolving/authenticating the id
 * first. This is a plain lookup, not exposed as its own server action.
 */
export async function getUserById(id: string): Promise<SerializedUser | null> {
  const user = await prisma.user.findUnique({ where: { id } });
  return user ? serializeUser(user) : null;
}

// ───────────────────────── Registration approval (admin)

export async function listPendingUsers(actor: Actor | null): Promise<SerializedUser[]> {
  assertAdmin(actor, 'Только администратор может видеть заявки.');
  const users = await prisma.user.findMany({
    where: { approvedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  return users.map(serializeUser);
}

export async function approveUser(actor: Actor | null, userId: string): Promise<{ id: string }> {
  assertAdmin(actor, 'Только администратор может одобрять заявки.');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('Пользователь не найден.');
  if (user.approvedAt) throw new ConflictError('Пользователь уже одобрен.');
  await prisma.user.update({ where: { id: userId }, data: { approvedAt: new Date() } });
  return { id: userId };
}

export async function rejectUser(actor: Actor | null, userId: string): Promise<{ id: string }> {
  assertAdmin(actor, 'Только администратор может отклонять заявки.');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('Пользователь не найден.');
  if (user.approvedAt) throw new ConflictError('Нельзя отклонить уже одобренного пользователя.');
  await prisma.user.delete({ where: { id: userId } });
  return { id: userId };
}

/**
 * Permanently delete a user — revokes their access to the platform entirely.
 * Cascades remove their authored cases, saved cases, reviews and
 * submissions (see onDelete: Cascade in the schema). Admin-only; an admin
 * cannot delete their own account.
 */
export async function deleteUser(actor: Actor | null, userId: string): Promise<{ id: string }> {
  const admin = assertAdmin(actor, 'Только администратор может удалять пользователей.');
  if (admin.id === userId) {
    throw new ForbiddenError('Нельзя удалить собственную учётную запись администратора.');
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('Пользователь не найден.');
  await prisma.user.delete({ where: { id: userId } });
  return { id: userId };
}

// ───────────────────────── Login diagnostics
//
// Kept as a thin, unauthenticated lookup for now — SP-1c folds this into a
// reworked login flow. Preserves the exact response shape/logic of the
// original `checkLoginIssue` server action.

/**
 * Diagnose why a sign-in failed without itself granting a session. Used by
 * the login form when next-auth's signIn returned an error — the generic
 * NextAuth response can't tell "wrong password" from "account still
 * pending approval", so this looks it up explicitly.
 *
 * Returns:
 *   - 'pending'   — credentials match but admin hasn't approved yet
 *   - 'invalid'   — wrong email or password
 */
export async function checkLoginIssue(
  email: string,
  password: string,
): Promise<{ status: 'pending' | 'invalid' }> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return { status: 'invalid' };
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return { status: 'invalid' };
  if (!user.approvedAt) return { status: 'pending' };
  return { status: 'invalid' };
}

// ───────────────────────── Password reset
//
// `bcrypt` hashing stays as-is here (argon2id migration is SP-1c — out of
// scope for this extraction). Email sending is a transport/infra concern
// (uses the `resend` package + env vars) and stays in the web wrapper;
// these functions only do the DB/token bookkeeping and hand back what the
// wrapper needs to build and send the email.

export type PasswordResetIssued = { userId: string; to: string; rawToken: string };

/**
 * Issue a password-reset token if (and only if) the email belongs to an
 * existing, admin-approved user and a resend isn't currently throttled.
 * Returns `null` in every other case (malformed email, unknown email,
 * unapproved account, throttled) — the caller (web wrapper) responds the
 * same way regardless, preserving the original anti-enumeration behavior.
 */
export async function requestPasswordReset(email: string): Promise<PasswordResetIssued | null> {
  const parsed = z.string().email().safeParse(email);
  if (!parsed.success) return null;

  const normalized = parsed.data.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user || !user.approvedAt) return null;

  const now = new Date();
  const recent = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id, usedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  const throttled =
    !!recent && recent.expiresAt > now && isWithinResendCooldown(recent.createdAt, now);
  if (throttled) return null;

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

  return { userId: user.id, to: normalized, rawToken };
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

export async function resetPassword(token: string, newPassword: string): Promise<{ id: string }> {
  const parsed = resetPasswordSchema.safeParse({ token, newPassword });
  if (!parsed.success) throw new ValidationError('Пароль должен быть не короче 6 символов.');

  const now = new Date();
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(parsed.data.token) },
  });
  if (!record || !isResetTokenUsable(record, now)) {
    throw new ValidationError('Ссылка устарела или недействительна. Запросите восстановление заново.');
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

  return { id: record.userId };
}
