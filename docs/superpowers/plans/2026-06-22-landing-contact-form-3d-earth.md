# Landing Contact Form + 3D Earth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a contact section with an auto-rotating 3D Earth and a message form (emailing `docjob@inbox.kz` via Resend) below the address/email card on the DocJob landing page.

**Architecture:** A client `EarthCanvas` (react-three-fiber + drei + GLTF model) is lazy-loaded (`next/dynamic`, `ssr:false`) inside a client `LandingContactForm`, which posts to a new `sendContactMessage` server action that emails via the existing `sendEmail` module (extended with `replyTo`). The landing Server Component renders the form below the existing contacts card. UI strings are i18n (ru/kk).

**Tech Stack:** Next.js 15 (App Router), React 18, three / @react-three/fiber@8 / @react-three/drei@9, Resend, Zod, react-hook-form, framer-motion, next-intl, shadcn/ui, vitest.

---

## File Structure

- **Add deps** `three`, `@react-three/fiber@^8`, `@react-three/drei@^9`, dev `@types/three`.
- **Create** `public/planet/*` — GLTF Earth model assets (copied from the reference repo).
- **Modify** `src/lib/email.ts` — add `replyTo` to `sendEmail`; add pure `buildContactEmail` + `escapeHtml`.
- **Modify** `src/lib/email.test.ts` — add `buildContactEmail` tests.
- **Modify** `src/app/actions.ts` — add `sendContactMessage` server action.
- **Create** `src/components/landing/earth-canvas.tsx` — client R3F canvas with auto-rotating Earth.
- **Create** `src/components/landing/contact-form.tsx` — client form + lazy Earth + i18n + honeypot.
- **Modify** `src/i18n/messages/ru.json`, `src/i18n/messages/kk.json` — `landing.contacts.form.*` keys.
- **Modify** `src/app/landing/page.tsx` — render `<LandingContactForm/>` below the contacts card.

**Branding rule:** all user-facing copy uses "DocJob" — never "MEDIZO".

---

## Task 1: Add 3D dependencies and copy the Earth model

**Files:**
- Modify: `package.json` (deps added by npm)
- Create: `public/planet/*`

- [ ] **Step 1: Install the 3D libraries**

Run (from repo root `C:\Users\jafar\Documents\GitHub\MEDIZO_AI_HACKATHON\.claude\worktrees\dreamy-pasteur-0a5a61`):
```bash
npm install three@^0.161.0 @react-three/fiber@^8.15.0 @react-three/drei@^9.99.0
npm install -D @types/three
```

- [ ] **Step 2: Copy the GLTF Earth assets from the reference repo**

Run:
```bash
git clone --depth 1 https://github.com/ladunjexa/reactjs18-3d-portfolio.git /tmp/rt3d-assets
mkdir -p public/planet
cp -r /tmp/rt3d-assets/public/planet/. public/planet/
rm -rf /tmp/rt3d-assets
ls public/planet && ls public/planet/textures
```
Expected: `license.txt  scene.bin  scene.gltf  textures` and `Clouds_baseColor.png  Planet_baseColor.png`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json public/planet
git commit -m "feat: add three.js deps and GLTF Earth model assets"
```

---

## Task 2: Extend email module — replyTo + buildContactEmail (TDD)

**Files:**
- Modify: `src/lib/email.ts`
- Test: `src/lib/email.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/email.test.ts`:
```ts
import { buildContactEmail } from './email';

describe('buildContactEmail', () => {
  const input = { name: 'Иван', email: 'ivan@example.com', message: 'Здравствуйте, есть вопрос.' };

  it('includes name, email and message in text and html', () => {
    const { text, html } = buildContactEmail(input);
    for (const v of [input.name, input.email, input.message]) {
      expect(text).toContain(v);
      expect(html).toContain(v);
    }
  });

  it('has a non-empty subject', () => {
    expect(buildContactEmail(input).subject.length).toBeGreaterThan(0);
  });

  it('escapes HTML in user input to prevent injection', () => {
    const { html } = buildContactEmail({ ...input, name: '<script>x</script>' });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `buildContactEmail` is not exported.

- [ ] **Step 3: Add `replyTo` to sendEmail and implement buildContactEmail**

In `src/lib/email.ts`, change the `SendEmailInput` interface to add `replyTo`:
```ts
export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}
```

Change the `sendEmail` function body so it logs and forwards `replyTo`. Replace the existing function with:
```ts
export async function sendEmail({ to, subject, html, text, replyTo }: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('[email:dev] No RESEND_API_KEY — skipping real send.');
    console.log(`[email:dev] To: ${to}`);
    if (replyTo) console.log(`[email:dev] Reply-To: ${replyTo}`);
    console.log(`[email:dev] Subject: ${subject}`);
    console.log(`[email:dev] Body:\n${text ?? html}`);
    return;
  }
  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({ from: FROM, to, subject, html, text, replyTo });
  if (error) {
    throw new Error(`Resend failed: ${error.message}`);
  }
}
```

Add at the END of `src/lib/email.ts`:
```ts
/** Escape HTML so user-supplied text can't inject markup into the email. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Build subject/html/text for a contact-form submission. Pure + testable. */
export function buildContactEmail(input: { name: string; email: string; message: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = 'Новое сообщение с сайта — DocJob';

  const text =
    `Новое сообщение с формы обратной связи DocJob.\n\n` +
    `Имя: ${input.name}\n` +
    `Email: ${input.email}\n\n` +
    `Сообщение:\n${input.message}`;

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
      <h2 style="margin-bottom: 16px;">Новое сообщение с сайта DocJob</h2>
      <p><strong>Имя:</strong> ${escapeHtml(input.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(input.email)}</p>
      <p style="margin-top: 16px;"><strong>Сообщение:</strong></p>
      <p style="white-space: pre-wrap;">${escapeHtml(input.message)}</p>
    </div>
  `.trim();

  return { subject, html, text };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all email tests green (password-reset + contact).

- [ ] **Step 5: Commit**

```bash
git add src/lib/email.ts src/lib/email.test.ts
git commit -m "feat: add replyTo support and buildContactEmail template"
```

---

## Task 3: `sendContactMessage` server action

**Files:**
- Modify: `src/app/actions.ts`

- [ ] **Step 1: Add imports**

In `src/app/actions.ts`, add to the imports near the other `@/lib/...` imports:
```ts
import { SITE_EMAIL } from '@/lib/site';
import { buildContactEmail } from '@/lib/email';
```
(Note: `sendEmail` is already imported in this file from the password-reset work. If for any reason it is not, change the line to `import { sendEmail, buildContactEmail } from '@/lib/email';`. `z`, `ok`, `fail`, and the `ActionResult` type already exist in this file.)

- [ ] **Step 2: Append the action**

Add to the END of `src/app/actions.ts`:
```ts
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
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/actions.ts
git commit -m "feat: add sendContactMessage server action"
```

---

## Task 4: EarthCanvas client component

**Files:**
- Create: `src/components/landing/earth-canvas.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/landing/earth-canvas.tsx`:
```tsx
'use client';

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Preload, useGLTF, Html, useProgress } from '@react-three/drei';

function CanvasLoader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <span className="text-sm text-muted-foreground">{progress.toFixed(0)}%</span>
    </Html>
  );
}

function Earth() {
  const earth = useGLTF('/planet/scene.gltf');
  return <primitive object={earth.scene} scale={2.5} position-y={0} rotation-y={0} />;
}

export default function EarthCanvas() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ preserveDrawingBuffer: true }}
      camera={{ fov: 45, near: 0.1, far: 200, position: [-4, 3, 6] }}
    >
      <Suspense fallback={<CanvasLoader />}>
        <OrbitControls
          autoRotate
          enablePan={false}
          enableZoom={false}
          maxPolarAngle={Math.PI / 2}
          minPolarAngle={Math.PI / 2}
        />
        <Earth />
        <Preload all />
      </Suspense>
    </Canvas>
  );
}

useGLTF.preload('/planet/scene.gltf');
```
Note: unlike the reference, `frameloop="demand"` is intentionally omitted so the default continuous loop drives `autoRotate` (guarantees the Earth visibly spins).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (R3F augments JSX so `<primitive>` and pierced props like `position-y` type-check.)

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/earth-canvas.tsx
git commit -m "feat: add auto-rotating 3D Earth canvas"
```

---

## Task 5: i18n keys for the contact form

**Files:**
- Modify: `src/i18n/messages/ru.json`
- Modify: `src/i18n/messages/kk.json`

- [ ] **Step 1: Add the Russian keys**

In `src/i18n/messages/ru.json`, inside `landing` → `contacts`, the block currently ends:
```json
      "addressValue": "Город Астана, проспект Кабанбай батыра 6/1, БЦ «Каскад»",
      "emailLabel": "Email"
    },
```
Change it to (note the comma after `"Email"` and the new `form` object):
```json
      "addressValue": "Город Астана, проспект Кабанбай батыра 6/1, БЦ «Каскад»",
      "emailLabel": "Email",
      "form": {
        "heading": "Напишите нам",
        "subtitle": "Есть вопрос или предложение? Заполните форму — ответим на вашу почту.",
        "nameLabel": "Имя",
        "namePlaceholder": "Ваше имя",
        "emailLabel": "Email",
        "emailPlaceholder": "you@example.com",
        "messageLabel": "Сообщение",
        "messagePlaceholder": "Ваше сообщение…",
        "submit": "Отправить",
        "submitting": "Отправка…",
        "successTitle": "Сообщение отправлено",
        "successDescription": "Спасибо! Мы свяжемся с вами по указанной почте.",
        "errorTitle": "Не удалось отправить",
        "errorDescription": "Попробуйте ещё раз позже.",
        "modelCredit": "3D-модель Земли — «Stylized planet» by cmzw (CC-BY-4.0)",
        "errors": {
          "name": "Введите имя",
          "email": "Введите корректный email",
          "message": "Введите сообщение"
        }
      }
    },
```

- [ ] **Step 2: Add the Kazakh keys**

In `src/i18n/messages/kk.json`, inside `landing` → `contacts`, the block currently ends:
```json
      "addressValue": "Астана қ., Қабанбай батыр даңғ. 6/1, «Каскад» БО",
      "emailLabel": "Email"
    },
```
Change it to:
```json
      "addressValue": "Астана қ., Қабанбай батыр даңғ. 6/1, «Каскад» БО",
      "emailLabel": "Email",
      "form": {
        "heading": "Бізге жазыңыз",
        "subtitle": "Сұрағыңыз немесе ұсынысыңыз бар ма? Форманы толтырыңыз — поштаңызға жауап береміз.",
        "nameLabel": "Аты-жөні",
        "namePlaceholder": "Атыңыз",
        "emailLabel": "Email",
        "emailPlaceholder": "you@example.com",
        "messageLabel": "Хабарлама",
        "messagePlaceholder": "Хабарламаңыз…",
        "submit": "Жіберу",
        "submitting": "Жіберілуде…",
        "successTitle": "Хабарлама жіберілді",
        "successDescription": "Рахмет! Көрсетілген пошта арқылы хабарласамыз.",
        "errorTitle": "Жіберілмеді",
        "errorDescription": "Кейінірек қайталап көріңіз.",
        "modelCredit": "Жердің 3D-моделі — «Stylized planet» by cmzw (CC-BY-4.0)",
        "errors": {
          "name": "Атыңызды енгізіңіз",
          "email": "Жарамды email енгізіңіз",
          "message": "Хабарлама енгізіңіз"
        }
      }
    },
```

- [ ] **Step 3: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/i18n/messages/ru.json','utf8')); JSON.parse(require('fs').readFileSync('src/i18n/messages/kk.json','utf8')); console.log('JSON OK')"`
Expected: `JSON OK`.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages/ru.json src/i18n/messages/kk.json
git commit -m "feat: add i18n keys for landing contact form"
```

---

## Task 6: LandingContactForm client component

**Files:**
- Create: `src/components/landing/contact-form.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/landing/contact-form.tsx`:
```tsx
'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { sendContactMessage } from '@/app/actions';

const EarthCanvas = dynamic(() => import('./earth-canvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[300px] w-full items-center justify-center text-sm text-muted-foreground">
      …
    </div>
  ),
});

export function LandingContactForm() {
  const t = useTranslations('landing.contacts.form');
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const schema = z.object({
    name: z.string().min(1, t('errors.name')).max(100),
    email: z.string().email(t('errors.email')).max(200),
    message: z.string().min(1, t('errors.message')).max(2000),
    company: z.string().optional(),
  });
  type Values = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: Values) => {
    setIsLoading(true);
    const res = await sendContactMessage(data);
    setIsLoading(false);
    if (res.success) {
      toast({ title: t('successTitle'), description: t('successDescription') });
      reset();
    } else {
      toast({ variant: 'destructive', title: t('errorTitle'), description: res.error });
    }
  };

  return (
    <div className="flex flex-col-reverse gap-8 xl:flex-row">
      <motion.div
        initial={{ opacity: 0, x: -40 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="xl:flex-[0.75]"
      >
        <Card className="border-border/60 bg-card/60 p-6 md:p-8">
          <h3 className="font-headline text-xl font-semibold md:text-2xl">{t('heading')}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{t('subtitle')}</p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-5">
            {/* honeypot: hidden from humans, off the tab order */}
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="hidden"
              {...register('company')}
            />

            <div className="space-y-2">
              <Label htmlFor="cf-name">{t('nameLabel')}</Label>
              <Input id="cf-name" placeholder={t('namePlaceholder')} {...register('name')} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="cf-email">{t('emailLabel')}</Label>
              <Input id="cf-email" type="email" placeholder={t('emailPlaceholder')} {...register('email')} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="cf-message">{t('messageLabel')}</Label>
              <Textarea id="cf-message" rows={6} placeholder={t('messagePlaceholder')} {...register('message')} />
              {errors.message && <p className="text-sm text-destructive">{errors.message.message}</p>}
            </div>

            <Button type="submit" disabled={isLoading} className="w-fit">
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? t('submitting') : t('submit')}
            </Button>
          </form>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 40 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="flex flex-col xl:flex-1"
      >
        <div className="h-[320px] md:h-[460px] xl:h-full xl:min-h-[460px]">
          <EarthCanvas />
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground/70">{t('modelCredit')}</p>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (`@/components/ui/card|input|textarea|label|button`, `@/hooks/use-toast`, and `sendContactMessage` all resolve.)

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/contact-form.tsx
git commit -m "feat: add landing contact form with lazy 3D Earth"
```

---

## Task 7: Render the form on the landing page

**Files:**
- Modify: `src/app/landing/page.tsx`

- [ ] **Step 1: Import the component**

In `src/app/landing/page.tsx`, add after the existing component imports (e.g. after the `CyclingWord` import line):
```ts
import { LandingContactForm } from '@/components/landing/contact-form';
```

- [ ] **Step 2: Render it below the contacts card**

In `src/app/landing/page.tsx`, find the end of the `#contacts` section:
```tsx
          </Card>
        </div>
      </section>
```
Replace it with:
```tsx
          </Card>
        </div>

        <div className="mx-auto mt-12 max-w-6xl">
          <LandingContactForm />
        </div>
      </section>
```
(This is the `</Card>` that closes the address/email card — the one right after the `mailto:docjob@inbox.kz` link block, immediately before the `<footer>`.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/landing/page.tsx
git commit -m "feat: render contact form with 3D Earth on landing"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Tests + typecheck**

Run: `npm test`
Expected: PASS (all email/token tests green).

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 2: Production build (catches three.js/SSR/ESM issues)**

Run: `npm run build`
Expected: build completes. If it fails on ESM from `three`/`@react-three/drei`, add `transpilePackages: ['three']` to `next.config.ts` (inside the `nextConfig` object), then rebuild. Commit that change if needed:
```bash
git add next.config.ts
git commit -m "fix: transpile three for production build"
```

- [ ] **Step 3: Manual smoke test**

Start the dev server (`npm run dev`), open `http://localhost:3000/landing`, scroll to the contacts section, and confirm:
1. Below the address/email card, the Earth renders and **auto-rotates**.
2. Submitting the form with valid name/email/message shows the success toast and clears the form.
3. The message email arrives at `docjob@inbox.kz` (or, with no `RESEND_API_KEY`, appears in the dev console with the correct Reply-To = sender email).
4. The model credit line "Stylized planet by cmzw (CC-BY-4.0)" is visible under the Earth.

---

## Self-Review notes

- **Spec coverage:** deps + assets (Task 1) ✓; `replyTo` + `buildContactEmail` + HTML escaping (Task 2) ✓; `sendContactMessage` with honeypot + SITE_EMAIL + replyTo (Task 3) ✓; EarthCanvas (Task 4) ✓; i18n ru/kk (Task 5) ✓; contact form with lazy Earth + honeypot + credit (Task 6) ✓; landing integration below the card (Task 7) ✓; attribution kept (`public/planet/license.txt` from Task 1; UI credit from Tasks 5–6); verification incl. build (Task 8) ✓.
- **Type consistency:** `buildContactEmail({name,email,message})` signature matches its call in `sendContactMessage`; `sendEmail`'s new `replyTo` is optional so existing password-reset callers are unaffected; `EarthCanvas` is a default export consumed via `dynamic(() => import('./earth-canvas'))`; i18n namespace `landing.contacts.form` matches `useTranslations('landing.contacts.form')`.
- **Deviation from reference:** EmailJS replaced by our Resend `sendEmail`; `frameloop="demand"` dropped so `autoRotate` always animates. Both intentional, noted in spec.
- **TDD scope:** only the pure `buildContactEmail` is unit-tested (vitest); the action, R3F canvas, and pages are verified via typecheck + production build + manual smoke test, consistent with the repo's existing test posture.
