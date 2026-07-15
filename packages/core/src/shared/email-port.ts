/**
 * Transport-agnostic email-sending port. `@docjob/core` builds email
 * content (see `email-templates.ts`) and calls `deps.email.send(...)` — it
 * never touches an email provider SDK or provider env vars directly, which
 * keeps `@docjob/core`'s boundary test (`boundary.test.ts`, which forbids
 * importing `resend`/email infra) satisfied.
 *
 * The web app supplies a Resend-backed adapter (`apps/web/src/lib/email.ts`'s
 * `sendEmail`) via `ApiContext.email` at request time (see
 * `packages/api/src/context.ts`); tests inject a spy/no-op implementation.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface EmailSender {
  send(msg: EmailMessage): Promise<void>;
}
