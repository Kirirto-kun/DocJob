// `buildContactEmail` and `buildPasswordResetEmail` moved to
// `@docjob/core`'s `packages/core/src/shared/email-templates.ts` (SP-4a Task
// 2) — they're pure subject/html/text builders with no email-provider
// dependency, so they now live alongside the domain services (e.g.
// `contact.service.ts`'s `sendContactMessage`) that use them for every
// transport, not just the web Server Action. Re-exported here so existing
// web imports (`@/lib/email`) keep resolving unchanged.
export { buildContactEmail, buildPasswordResetEmail } from '@docjob/core';

/**
 * Send an email via Resend. When RESEND_API_KEY is absent (local dev), the
 * message is logged to the console instead, so the whole flow can be exercised
 * without credentials or a verified domain.
 *
 * This stays in `apps/web` (not `@docjob/core`) — it's the transport/infra
 * concern (the `resend` package + `RESEND_API_KEY`/`EMAIL_FROM` env vars)
 * that core's boundary test (`packages/core/src/boundary.test.ts`) forbids
 * importing. The web mount wraps this as the `EmailSender` adapter it
 * injects into `ApiContext` (`apps/web/src/app/api/trpc/[trpc]/route.ts`).
 */
export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

const FROM = process.env.EMAIL_FROM ?? 'DocJob <noreply@docjob.kz>';

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
