import { z } from 'zod';
import * as core from '@docjob/core';
import { publicProcedure, router } from '../trpc';

/**
 * `contact` tRPC router — thin wire wrapper over `@docjob/core`'s
 * `contact.sendContactMessage` (packages/core/src/contact/contact.service.ts).
 *
 * SP-4a Task 2 update: email delivery now happens HERE (via core), not only
 * in the web Server Action. `sendContactMessage` validates the form +
 * evaluates the honeypot via `core.contact.parseContactMessage`, then — only
 * if the honeypot wasn't tripped — builds and sends the actual email through
 * an injected `EmailSender` port (`ctx.email`, see `../context.ts`). The
 * concrete transport (Resend + env vars) is supplied by the caller of
 * `createContext` at request time (the web mount injects a Resend-backed
 * adapter; the in-process server caller does too; tests inject a spy/no-op),
 * so `@docjob/api`/`@docjob/core` never import an email provider SDK
 * directly — this keeps both packages' boundary tests (boundary.test.ts,
 * which forbid `@/*` and email infra) satisfied while making delivery work
 * uniformly for every transport, including mobile (tRPC-only) clients that
 * have no Server Action to fall back on. The recipient inbox is injected too
 * (SP-4a Task 3 follow-up, `ctx.contactInboxEmail`) rather than hardcoded in
 * core — see `context.ts`'s doc comment on `ApiContext.contactInboxEmail`.
 *
 * Auth tier: `send` = publicProcedure. `sendContactMessage` takes no actor at
 * all (anonymous visitors submit the contact form) — matches the original
 * Server Action exactly (no `getActor()`/auth check there either).
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
    .mutation(({ ctx, input }) => {
      // Throws ValidationError (-> TRPCError BAD_REQUEST) for a malformed
      // payload; a tripped honeypot parses fine and resolves { sent: true }
      // without sending, matching the pre-existing silent-accept behavior.
      return core.contact.sendContactMessage(input, { email: ctx.email, inboxEmail: ctx.contactInboxEmail });
    }),
});
