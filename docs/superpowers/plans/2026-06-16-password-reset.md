# Password Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Забыли пароль?" email-based password reset flow (one-time reset link) to the MEDIZO app.

**Architecture:** A new `PasswordResetToken` table stores a SHA-256 *hash* of a one-time token (1h TTL, single-use). `requestPasswordReset` issues a token and emails a `/reset-password?token=...` link via Resend (with a console fallback when no API key is set). `resetPassword` validates the token and updates the bcrypt password hash. Security-critical pure logic (token gen/hash/expiry/cooldown) lives in `src/lib/password-reset-tokens.ts` and is unit-tested with vitest; DB-touching actions and pages are verified via `npm run typecheck` and a manual dev walkthrough.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Prisma + Postgres, NextAuth v5, bcryptjs, Resend, Zod, react-hook-form, shadcn/ui, vitest.

---

## File Structure

- **Create** `src/lib/password-reset-tokens.ts` — pure token helpers (no DB, no Next). Unit-tested.
- **Create** `src/lib/password-reset-tokens.test.ts` — vitest tests for the helpers.
- **Create** `src/lib/email.ts` — `sendEmail` (Resend + console fallback) + `buildPasswordResetEmail` template.
- **Create** `src/lib/email.test.ts` — vitest test for the email template builder.
- **Create** `vitest.config.ts` — minimal node-env vitest config.
- **Create** `src/app/forgot-password/page.tsx` — request-reset page.
- **Create** `src/app/reset-password/page.tsx` — set-new-password page.
- **Modify** `prisma/schema.prisma` — new `PasswordResetToken` model + `User.passwordResetTokens` relation.
- **Modify** `src/app/actions.ts` — `requestPasswordReset`, `checkResetToken`, `resetPassword`.
- **Modify** `src/middleware.ts` — make `/forgot-password` and `/reset-password` public.
- **Modify** `src/app/login/page.tsx` — add "Забыли пароль?" link.
- **Modify** `package.json` — add `resend` + `vitest` deps and a `test` script.
- **Modify** `.env.example` — document `RESEND_API_KEY`, `EMAIL_FROM`.

**Note on i18n:** the new pages and the login link use hard-coded Russian strings (the app's primary language) to keep scope small. Adding `next-intl` keys for ru/kk is a recommended follow-up, not part of this plan.

---

## Task 1: Database model for reset tokens

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the relation field to the `User` model**

In `prisma/schema.prisma`, inside `model User { ... }`, add this line next to the other relation fields (e.g. just after `savedCases SavedCase[]`):

```prisma
  passwordResetTokens PasswordResetToken[]
```

- [ ] **Step 2: Add the new model**

Add this model to `prisma/schema.prisma` (e.g. right after `model AnnouncementDismissal { ... }` at the end):

```prisma
model PasswordResetToken {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
}
```

- [ ] **Step 3: Create the migration and regenerate the client**

Run: `npm run db:migrate -- --name add_password_reset_token`
Expected: Prisma creates `prisma/migrations/<timestamp>_add_password_reset_token/migration.sql`, applies it, and regenerates the client. (Requires the Postgres container/DB to be running; start it with `npm run docker:up` if needed.)

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add PasswordResetToken model"
```

---

## Task 2: Pure token helpers (TDD) + vitest setup

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/password-reset-tokens.ts`
- Test: `src/lib/password-reset-tokens.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Install vitest and add a test script**

Run: `npm install -D vitest`

Then in `package.json`, add to the `"scripts"` block:

```json
    "test": "vitest run"
```

- [ ] **Step 2: Create the vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Write the failing test**

Create `src/lib/password-reset-tokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  generateResetToken,
  hashResetToken,
  resetTokenExpiry,
  isResetTokenExpired,
  isResetTokenUsable,
  isWithinResendCooldown,
  RESET_TOKEN_TTL_MS,
  RESET_TOKEN_RESEND_COOLDOWN_MS,
} from './password-reset-tokens';

describe('generateResetToken', () => {
  it('returns a 64-char hex string', () => {
    expect(generateResetToken()).toMatch(/^[0-9a-f]{64}$/);
  });
  it('returns a different value each call', () => {
    expect(generateResetToken()).not.toBe(generateResetToken());
  });
});

describe('hashResetToken', () => {
  it('is deterministic for the same input', () => {
    expect(hashResetToken('abc')).toBe(hashResetToken('abc'));
  });
  it('differs for different inputs', () => {
    expect(hashResetToken('abc')).not.toBe(hashResetToken('abd'));
  });
  it('does not return the raw token', () => {
    expect(hashResetToken('abc')).not.toBe('abc');
  });
});

describe('expiry', () => {
  const now = new Date('2026-06-16T12:00:00Z');
  it('resetTokenExpiry is TTL after now', () => {
    expect(resetTokenExpiry(now).getTime()).toBe(now.getTime() + RESET_TOKEN_TTL_MS);
  });
  it('not expired before TTL elapses', () => {
    const exp = resetTokenExpiry(now);
    const later = new Date(now.getTime() + RESET_TOKEN_TTL_MS - 1000);
    expect(isResetTokenExpired(exp, later)).toBe(false);
  });
  it('expired once TTL passes', () => {
    const exp = resetTokenExpiry(now);
    const later = new Date(now.getTime() + RESET_TOKEN_TTL_MS + 1000);
    expect(isResetTokenExpired(exp, later)).toBe(true);
  });
});

describe('isResetTokenUsable', () => {
  const now = new Date('2026-06-16T12:00:00Z');
  const future = new Date(now.getTime() + 1000);
  const past = new Date(now.getTime() - 1000);
  it('usable when unused and not expired', () => {
    expect(isResetTokenUsable({ usedAt: null, expiresAt: future }, now)).toBe(true);
  });
  it('not usable when already used', () => {
    expect(isResetTokenUsable({ usedAt: now, expiresAt: future }, now)).toBe(false);
  });
  it('not usable when expired', () => {
    expect(isResetTokenUsable({ usedAt: null, expiresAt: past }, now)).toBe(false);
  });
});

describe('isWithinResendCooldown', () => {
  const now = new Date('2026-06-16T12:00:00Z');
  it('true just after creation', () => {
    expect(isWithinResendCooldown(now, now)).toBe(true);
  });
  it('false after cooldown elapses', () => {
    const before = new Date(now.getTime() - RESET_TOKEN_RESEND_COOLDOWN_MS - 1);
    expect(isWithinResendCooldown(before, now)).toBe(false);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./password-reset-tokens` (module does not exist yet).

- [ ] **Step 5: Write the implementation**

Create `src/lib/password-reset-tokens.ts`:

```ts
import { randomBytes, createHash } from 'node:crypto';

/** Reset links live for 1 hour. */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/** Don't send more than one reset email per minute per user. */
export const RESET_TOKEN_RESEND_COOLDOWN_MS = 60 * 1000;

/** A fresh, high-entropy reset token — the raw value emailed to the user. */
export function generateResetToken(): string {
  return randomBytes(32).toString('hex');
}

/** SHA-256 of the raw token. Only this hash is stored in the database. */
export function hashResetToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Expiry timestamp for a token created at `now`. */
export function resetTokenExpiry(now: Date): Date {
  return new Date(now.getTime() + RESET_TOKEN_TTL_MS);
}

/** True if `expiresAt` is at or before `now`. */
export function isResetTokenExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/** A token is usable only if it has not been used and has not expired. */
export function isResetTokenUsable(
  token: { usedAt: Date | null; expiresAt: Date },
  now: Date,
): boolean {
  if (token.usedAt !== null) return false;
  return !isResetTokenExpired(token.expiresAt, now);
}

/** True if the previous token was created too recently to send another email. */
export function isWithinResendCooldown(lastCreatedAt: Date, now: Date): boolean {
  return now.getTime() - lastCreatedAt.getTime() < RESET_TOKEN_RESEND_COOLDOWN_MS;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all token-helper tests green.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts package.json package-lock.json src/lib/password-reset-tokens.ts src/lib/password-reset-tokens.test.ts
git commit -m "feat: add password reset token helpers with tests"
```

---

## Task 3: Email module (Resend + console fallback)

**Files:**
- Create: `src/lib/email.ts`
- Test: `src/lib/email.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Resend**

Run: `npm install resend`

- [ ] **Step 2: Write the failing test**

Create `src/lib/email.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildPasswordResetEmail } from './email';

describe('buildPasswordResetEmail', () => {
  const url = 'https://docjob.kz/reset-password?token=abc123';

  it('includes the reset url in both html and text', () => {
    const { html, text } = buildPasswordResetEmail(url);
    expect(html).toContain(url);
    expect(text).toContain(url);
  });

  it('has a non-empty subject', () => {
    expect(buildPasswordResetEmail(url).subject.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./email`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/email.ts`:

```ts
import { RESET_TOKEN_TTL_MS } from './password-reset-tokens';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

const FROM = process.env.EMAIL_FROM ?? 'MEDIZO <onboarding@resend.dev>';

/**
 * Send an email via Resend. When RESEND_API_KEY is absent (local dev), the
 * message is logged to the console instead, so the whole flow can be exercised
 * without credentials or a verified domain.
 */
export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('[email:dev] No RESEND_API_KEY — skipping real send.');
    console.log(`[email:dev] To: ${to}`);
    console.log(`[email:dev] Subject: ${subject}`);
    console.log(`[email:dev] Body:\n${text ?? html}`);
    return;
  }
  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({ from: FROM, to, subject, html, text });
  if (error) {
    throw new Error(`Resend failed: ${error.message}`);
  }
}

const TTL_HOURS = Math.round(RESET_TOKEN_TTL_MS / (60 * 60 * 1000));

/** Build subject/html/text for the password-reset email. Pure + testable. */
export function buildPasswordResetEmail(resetUrl: string): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = 'Восстановление пароля — MEDIZO';

  const text =
    `Вы запросили восстановление пароля в MEDIZO.\n\n` +
    `Перейдите по ссылке, чтобы задать новый пароль (ссылка действует ${TTL_HOURS} ч):\n` +
    `${resetUrl}\n\n` +
    `Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.`;

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #111;">
      <h2 style="margin-bottom: 16px;">Восстановление пароля</h2>
      <p>Вы запросили восстановление пароля в MEDIZO.</p>
      <p style="margin: 24px 0;">
        <a href="${resetUrl}"
           style="display: inline-block; padding: 12px 20px; background: #2563eb; color: #fff; border-radius: 8px; text-decoration: none;">
          Задать новый пароль
        </a>
      </p>
      <p style="font-size: 13px; color: #555;">Ссылка действует ${TTL_HOURS} ч. Если вы не запрашивали сброс — проигнорируйте это письмо.</p>
      <p style="font-size: 12px; color: #888; word-break: break-all;">${resetUrl}</p>
    </div>
  `.trim();

  return { subject, html, text };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — both `buildPasswordResetEmail` tests green (alongside the token tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/email.ts src/lib/email.test.ts
git commit -m "feat: add email sender with Resend and dev console fallback"
```

---

## Task 4: Server actions for the reset flow

**Files:**
- Modify: `src/app/actions.ts`

- [ ] **Step 1: Add imports**

At the top of `src/app/actions.ts`, after the existing `@/lib/...` imports (e.g. after the `import { deleteAttachmentFile } from '@/lib/storage';` line), add:

```ts
import {
  generateResetToken,
  hashResetToken,
  resetTokenExpiry,
  isResetTokenUsable,
  isWithinResendCooldown,
} from '@/lib/password-reset-tokens';
import { sendEmail, buildPasswordResetEmail } from '@/lib/email';
```

- [ ] **Step 2: Add the three actions**

Append this block to the end of `src/app/actions.ts`:

```ts
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
      // Invalidate any outstanding tokens, then issue a fresh one.
      await prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      });

      const rawToken = generateResetToken();
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashResetToken(rawToken),
          expiresAt: resetTokenExpiry(now),
        },
      });

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
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors). If `prisma.passwordResetToken` is reported as missing, the client wasn't regenerated — run `npx prisma generate` and retry. (`bcrypt`, `z`, `prisma`, `ok`, `fail`, `ActionResult` are already imported in this file.)

- [ ] **Step 4: Commit**

```bash
git add src/app/actions.ts
git commit -m "feat: add requestPasswordReset, checkResetToken, resetPassword actions"
```

---

## Task 5: Make the new routes public in middleware

**Files:**
- Modify: `src/middleware.ts:9`

- [ ] **Step 1: Add the routes to PUBLIC_PATHS**

In `src/middleware.ts`, change the `PUBLIC_PATHS` constant from:

```ts
const PUBLIC_PATHS = ['/login', '/register', '/landing', '/news'];
```

to:

```ts
const PUBLIC_PATHS = ['/login', '/register', '/landing', '/news', '/forgot-password', '/reset-password'];
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: allow public access to password reset pages"
```

---

## Task 6: Forgot-password page

**Files:**
- Create: `src/app/forgot-password/page.tsx`

- [ ] **Step 1: Create the page**

Create `src/app/forgot-password/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DocJobLogo } from '@/components/icons';
import { Loader2 } from 'lucide-react';
import { requestPasswordReset } from '@/app/actions';

const schema = z.object({ email: z.string().email('Введите корректный email') });
type Values = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: Values) => {
    setIsLoading(true);
    await requestPasswordReset(data.email);
    setIsLoading(false);
    setSubmitted(true);
  };

  return (
    <div className="relative flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <DocJobLogo className="h-16 w-16" />
          </div>
          <CardTitle className="text-2xl font-headline">Восстановление пароля</CardTitle>
          <CardDescription>Укажите email — пришлём ссылку для сброса пароля.</CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              Если этот email зарегистрирован, мы отправили на него ссылку для сброса пароля.
              Проверьте почту (и папку «Спам»).
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@example.com" {...register('email')} />
                {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Отправить ссылку
              </Button>
            </form>
          )}
          <div className="mt-4 text-center text-sm">
            <Link href="/login" className="text-primary hover:underline">
              Вернуться ко входу
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/forgot-password/page.tsx
git commit -m "feat: add forgot-password page"
```

---

## Task 7: Reset-password page

**Files:**
- Create: `src/app/reset-password/page.tsx`

- [ ] **Step 1: Create the page**

Create `src/app/reset-password/page.tsx`:

```tsx
'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { useToast } from '@/hooks/use-toast';
import { DocJobLogo } from '@/components/icons';
import { Loader2 } from 'lucide-react';
import { checkResetToken, resetPassword } from '@/app/actions';

const schema = z
  .object({
    newPassword: z.string().min(6, 'Минимум 6 символов'),
    confirm: z.string().min(1, 'Повторите пароль'),
  })
  .refine((d) => d.newPassword === d.confirm, {
    path: ['confirm'],
    message: 'Пароли не совпадают',
  });
type Values = z.infer<typeof schema>;

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const token = searchParams.get('token') ?? '';
  const [status, setStatus] = useState<'checking' | 'valid' | 'invalid'>('checking');
  const [isLoading, setIsLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    let active = true;
    checkResetToken(token).then((res) => {
      if (active) setStatus(res.valid ? 'valid' : 'invalid');
    });
    return () => {
      active = false;
    };
  }, [token]);

  const onSubmit = async (data: Values) => {
    setIsLoading(true);
    const res = await resetPassword({ token, newPassword: data.newPassword });
    setIsLoading(false);
    if (res.success) {
      toast({ title: 'Пароль изменён', description: 'Войдите с новым паролем.' });
      router.push('/login');
    } else {
      toast({ variant: 'destructive', title: 'Не удалось', description: res.error });
      setStatus('invalid');
    }
  };

  if (status === 'checking') {
    return <div className="text-center text-sm text-muted-foreground">Проверяем ссылку…</div>;
  }
  if (status === 'invalid') {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Ссылка устарела или недействительна.
        </div>
        <Button asChild className="w-full">
          <Link href="/forgot-password">Запросить новую ссылку</Link>
        </Button>
      </div>
    );
  }
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="newPassword">Новый пароль</Label>
        <PasswordInput id="newPassword" {...register('newPassword')} />
        {errors.newPassword && <p className="text-sm text-destructive">{errors.newPassword.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Повторите пароль</Label>
        <PasswordInput id="confirm" {...register('confirm')} />
        {errors.confirm && <p className="text-sm text-destructive">{errors.confirm.message}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Сохранить пароль
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="relative flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <DocJobLogo className="h-16 w-16" />
          </div>
          <CardTitle className="text-2xl font-headline">Новый пароль</CardTitle>
          <CardDescription>Задайте новый пароль для входа.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="text-center text-sm text-muted-foreground">Загрузка…</div>}>
            <ResetForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (Confirms `@/components/ui/password-input`, `@/hooks/use-toast`, and `@/components/icons` exports resolve — they are the same ones used by `src/app/login/page.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add src/app/reset-password/page.tsx
git commit -m "feat: add reset-password page"
```

---

## Task 8: "Забыли пароль?" link on the login page

**Files:**
- Modify: `src/app/login/page.tsx:112-117`

- [ ] **Step 1: Add the link**

In `src/app/login/page.tsx`, find this block inside `CardContent` (just after the `</Suspense>`):

```tsx
          <div className="mt-4 text-center text-sm">
            <span className="text-muted-foreground">{t('noAccount')} </span>
            <Link href="/register" className="text-primary hover:underline">
              {t('registerCta')}
            </Link>
          </div>
```

Add this block immediately **after** it:

```tsx
          <div className="mt-3 text-center text-sm">
            <Link href="/forgot-password" className="text-muted-foreground hover:text-primary hover:underline">
              Забыли пароль?
            </Link>
          </div>
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat: add forgot-password link to login page"
```

---

## Task 9: Document env vars + final verification

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Document the new env vars**

Append to `.env.example` (only if the keys are not already present):

```
# Email (password reset). Leave RESEND_API_KEY empty in dev to log emails to the console.
RESEND_API_KEY=
EMAIL_FROM="MEDIZO <noreply@docjob.kz>"
```

- [ ] **Step 2: Run the full test suite and typecheck**

Run: `npm test`
Expected: PASS — all token + email-template tests green.

Run: `npm run typecheck`
Expected: PASS — no type errors.

- [ ] **Step 3: Manual dev walkthrough (console email fallback)**

With `RESEND_API_KEY` unset and an approved user in the DB (e.g. the seeded `admin@docjob.local`), run `npm run dev` and:

1. Open `/login` → click **"Забыли пароль?"** → lands on `/forgot-password`.
2. Enter the approved user's email → submit → see the neutral "если email зарегистрирован…" message.
3. In the dev server console, find the `[email:dev]` log and copy the `/reset-password?token=...` URL.
4. Open that URL → form appears (token valid). Enter a new password twice → submit → redirected to `/login` with the "Пароль изменён" toast.
5. Log in with the new password → success.
6. Reopen the same reset URL → shows "Ссылка устарела или недействительна" (token is single-use).

Also confirm: entering a non-existent email at step 2 shows the **same** neutral message (no enumeration).

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "docs: document RESEND_API_KEY and EMAIL_FROM env vars"
```

---

## Post-implementation (manual, outside this plan)

To send real email in production: create a Resend account, generate `RESEND_API_KEY`, verify the `docjob.kz` domain (SPF/DKIM DNS records), and set `RESEND_API_KEY` + `EMAIL_FROM` in the production `.env`. For a quick real-send test before domain verification, Resend allows `onboarding@resend.dev` as `from` to your own account email.

## Self-Review notes

- **Spec coverage:** model (Task 1) ✓, hashed single-use 1h token (Task 2) ✓, Resend + console fallback (Task 3) ✓, anti-enumeration + approved-only + cooldown + reset action (Task 4) ✓, public routes (Task 5) ✓, both pages + login link (Tasks 6–8) ✓, env + manual security walkthrough (Task 9) ✓.
- **Type consistency:** helper names (`generateResetToken`, `hashResetToken`, `resetTokenExpiry`, `isResetTokenUsable`, `isWithinResendCooldown`) are used identically across Tasks 2 and 4; `requestPasswordReset` / `checkResetToken` / `resetPassword` signatures match their page call sites in Tasks 6–7.
- **Deviation from spec:** TDD is applied only to the pure token/email-template logic (vitest); DB-backed actions and React pages are verified via `npm run typecheck` + the Task 9 manual walkthrough, because the repo has no DB/component test harness and standing one up is out of scope for this feature.
