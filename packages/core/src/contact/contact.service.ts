import { z } from 'zod';
import { ValidationError } from '../shared/errors';
import type { EmailSender } from '../shared/email-port';
import { buildContactEmail } from '../shared/email-templates';

// Validation schema moved verbatim from apps/web/src/app/actions.ts.
const contactMessageSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  message: z.string().trim().min(1).max(2000),
  company: z.string().optional(), // honeypot — real users never fill this
});

export type ContactMessageInput = z.infer<typeof contactMessageSchema>;

export type ParsedContactMessage = {
  name: string;
  email: string;
  message: string;
  /** True if the hidden honeypot field was filled — caller should silently accept, not send. */
  isHoneypot: boolean;
};

/**
 * Validate a contact-form submission and evaluate the honeypot. Pure logic
 * only — no DB, no email transport. Exported standalone (in addition to
 * being used internally by `sendContactMessage` below) so callers that only
 * need validation — e.g. a future dry-run/preview path — don't have to
 * provide an `EmailSender`.
 *
 * Bots that fill the hidden `company` field parse successfully but come
 * back with `isHoneypot: true`, so the caller can silently accept
 * (`{ sent: true }`) without sending an email or revealing the trap.
 */
export function parseContactMessage(input: ContactMessageInput): ParsedContactMessage {
  const parsed = contactMessageSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('Проверьте правильность заполнения формы.');
  const { name, email, message, company } = parsed.data;
  return { name, email, message, isHoneypot: !!(company && company.trim().length > 0) };
}

/**
 * Validate a contact-form submission and deliver it via the injected
 * `EmailSender` port (SP-4a Task 2) — this is what makes `contact.send`
 * actually send mail for every transport (web *and* mobile/tRPC-only
 * clients), instead of delivery living only in the web Server Action.
 *
 * The recipient inbox is injected too (SP-4a Task 3 follow-up), not
 * hardcoded here — this used to duplicate `apps/web/src/lib/site.ts`'s
 * `SITE_EMAIL` as a local `CONTACT_INBOX_EMAIL` constant (silent-drift
 * risk: the two could go out of sync). `deps.inboxEmail` is threaded
 * through from `ApiContext.contactInboxEmail`, which every context-
 * construction site sets from the SAME `SITE_EMAIL` constant, so there's a
 * single source of truth again.
 *
 * Bots that fill the hidden `company` honeypot field still resolve
 * `{ sent: true }` (matching the pre-existing silent-accept behavior) but
 * the send is skipped entirely, so the trap is never revealed.
 */
export async function sendContactMessage(
  input: ContactMessageInput,
  deps: { email: EmailSender; inboxEmail: string },
): Promise<{ sent: true }> {
  const parsed = parseContactMessage(input);
  if (parsed.isHoneypot) return { sent: true };

  const { subject, html, text } = buildContactEmail({
    name: parsed.name,
    email: parsed.email,
    message: parsed.message,
  });
  await deps.email.send({ to: deps.inboxEmail, subject, html, text, replyTo: parsed.email });
  return { sent: true };
}
