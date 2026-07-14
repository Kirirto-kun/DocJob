import { z } from 'zod';
import * as core from '@docjob/core';
import { publicProcedure, router } from '../trpc';

/**
 * `contact` tRPC router — thin wire wrapper over `@docjob/core`'s
 * `contact.parseContactMessage` (packages/core/src/contact/contact.service.ts).
 *
 * KEY DECISION — email transport is NOT wired here. The pre-existing
 * `sendContactMessage` Server Action (apps/web/src/app/actions.ts) does two
 * things: (1) validate the form + evaluate the honeypot via
 * `core.contact.parseContactMessage` (pure, no I/O — already extracted to
 * core in SP-1b Task 7), then (2), only if the honeypot wasn't tripped,
 * build + send the actual email via `@/lib/email` (`buildContactEmail` +
 * `sendEmail`, backed by the `resend` package + env vars). Step (2) is a
 * transport/infra concern that lives behind `@/lib/*`, which `@docjob/api`'s
 * boundary test (boundary.test.ts) forbids importing — this package cannot
 * pull in Next.js web-app code. `contact.service.ts` was checked and
 * confirmed to export *only* the pure `parseContactMessage` — no DB, no
 * network I/O, no email-sending path lives in core either.
 *
 * So `send` here does ONLY step (1): validates the input and evaluates the
 * honeypot via core, then returns `{ sent: true }` unconditionally —
 * mirroring the original action's return contract, which also returns
 * `ok({ sent: true })` for the honeypot-tripped path without sending
 * anything. **It does not actually deliver email.** Real end-to-end email
 * delivery for a tRPC-originated contact submission is deferred to a later
 * task (the SP-1d Task 7 web-mount work, or a follow-up): either give
 * `@docjob/api`'s context a pluggable "send email" side-channel the web
 * mount injects at request time (keeping `@docjob/api` itself transport-
 * agnostic), or leave the existing `sendContactMessage` Server Action as the
 * only real send path and treat `contact.send` as validation-only for
 * non-Server-Action (e.g. future mobile) clients. Flagged explicitly in the
 * Task 6 report — do not read this router as "done" for end-to-end
 * contact-form delivery over tRPC.
 *
 * Auth tier: `send` = publicProcedure. Core's `parseContactMessage` takes no
 * actor at all (anonymous visitors submit the contact form) — matches the
 * original Server Action exactly (no `getActor()`/auth check there either).
 *
 * Input schema: `z.custom<ContactMessageInput>` (core's internal
 * `contactMessageSchema.safeParse` — including the `email`/length checks and
 * the honeypot `company` field — is the real validator, same rationale as
 * every other router's reuse of a core-owned zod shape).
 */

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export const contactRouter = router({
  send: publicProcedure
    .input(z.custom<core.contact.ContactMessageInput>(isPlainObject))
    .mutation(({ input }) => {
      // Throws ValidationError (-> TRPCError BAD_REQUEST) for a malformed
      // payload; a tripped honeypot parses fine and is simply not surfaced
      // to the caller, matching the original action's silent-accept.
      core.contact.parseContactMessage(input);
      return { sent: true as const };
    }),
});
