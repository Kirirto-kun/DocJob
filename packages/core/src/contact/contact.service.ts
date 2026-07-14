import { z } from 'zod';
import { ValidationError } from '../shared/errors';

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
 * only — no DB, no email transport. Building/sending the email
 * (`buildContactEmail` + `sendEmail`, using the `resend` package + env vars)
 * is a transport/infra concern and stays in the web wrapper, same split as
 * `users.requestPasswordReset` in packages/core/src/users/user.service.ts.
 *
 * Bots that fill the hidden `company` field parse successfully but come
 * back with `isHoneypot: true`, so the wrapper can silently accept
 * (`{ sent: true }`) without sending an email or revealing the trap.
 */
export function parseContactMessage(input: ContactMessageInput): ParsedContactMessage {
  const parsed = contactMessageSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('Проверьте правильность заполнения формы.');
  const { name, email, message, company } = parsed.data;
  return { name, email, message, isHoneypot: !!(company && company.trim().length > 0) };
}
