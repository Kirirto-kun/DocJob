import { z } from 'zod';
import * as core from '@docjob/core';
import { publicProcedure, protectedProcedure, adminProcedure, router } from '../trpc';

/**
 * `users` tRPC router — thin wire wrappers over `@docjob/core`'s `users.*`
 * domain functions (packages/core/src/users/user.service.ts). Every
 * procedure forwards `(ctx.actor, input)` (or just `input` for the public
 * `register`) into the matching core function; all business rules
 * (fine-grained auth, field validation, NotFound/Forbidden/Conflict/
 * Validation) live in core and surface here only via the DomainError ->
 * TRPCError mapping middleware (see trpc.ts). This router does NOT
 * reimplement any of that — per the SP-1d "parity fix" this task was asked to
 * hold to (like Task 4's `submissions` router), auth tier is matched 1:1
 * against the `assert*` call each core function actually makes, not against
 * a role that merely *sounds* admin-ish. Read directly off user.service.ts:
 *
 * - `me`            = protectedProcedure. `getUserById` itself has no
 *   internal assert (it's a plain lookup, documented in user.service.ts as
 *   "no auth check here — callers are responsible") — this procedure only
 *   needs a resolved `ctx.actor.id` to know *whose* id to look up, so the
 *   auth requirement lives entirely at this router tier, not in core.
 * - `updateProfile` = protectedProcedure. Core's `updateUser` calls
 *   `assertApproved`, then does its own fine-grained "self or admin" check
 *   inline (`ForbiddenError` for anyone editing someone else while not
 *   admin) — that finer check stays in core, not duplicated here.
 * - `list`          = adminProcedure. Core's `listUsers` calls `assertAdmin`
 *   (tightened from `assertApproved` in a security-hardening pass — it
 *   returns every user's full profile including email, so any approved
 *   doctor/reviewer could previously enumerate the whole user directory).
 *   This router matches core 1:1, same as `cases.update`/`tags.add`.
 * - `pending`       = adminProcedure. Core's `listPendingUsers` calls
 *   `assertAdmin`.
 * - `approve` / `reject` / `delete` = adminProcedure. Core's `approveUser` /
 *   `rejectUser` / `deleteUser` all call `assertAdmin` (the latter also does
 *   its own inline "admin can't delete themselves" check, left in core).
 * - `register`      = publicProcedure. Core's `registerUser` takes no actor
 *   at all — it's the public self-registration entry point, creating an
 *   unapproved user (`approvedAt: null`) pending admin approval. Login stays
 *   the dedicated `POST /api/auth/login` cookie-setting route from SP-1c,
 *   not tRPC — this router deliberately has no login/refresh/logout
 *   procedure, and `checkLoginIssue` (folded into `@docjob/auth`'s `login()`
 *   in SP-1c) is not re-added here.
 * - `requestPasswordReset` / `resetPassword` / `checkResetToken` (SP-4a
 *   Task 3) = publicProcedure. Anonymous by nature — the request-reset flow
 *   exists precisely for someone who's locked out. `requestPasswordReset`
 *   ALWAYS resolves `{ sent: true }` regardless of whether the email is
 *   registered/approved (anti-enumeration, matching the pre-existing web
 *   Server Action's behavior) — core's `requestPasswordReset` returns `null`
 *   in every "don't actually send" case and this procedure only branches on
 *   that to decide whether to build+send an email, never to change the
 *   response. The reset link is built via `buildResetLink(ctx.passwordResetBase, ...)`
 *   so web and mobile/tRPC-only clients emit an identical link; the email
 *   itself goes out through the injected `ctx.email` port (SP-4a Task 2),
 *   same pattern as `contact.send`.
 *
 * Input schemas: `updateProfile`/`register` reuse core's own input shapes via
 * `z.custom` (core's internal `safeParse` is the real validator, same
 * rationale as cases.ts/submissions.ts). `me`/`list`/`pending` take no input.
 * `approve`/`reject`/`delete` take a bare `id` string, no core-side schema to
 * reuse. `requestPasswordReset` takes `{ email }`, `resetPassword` takes
 * `{ token, newPassword }` (this router's own zod shapes — core's functions
 * take positional args, not an input object, so there's no core schema to
 * borrow here), `checkResetToken` takes a bare token string.
 */

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export const usersRouter = router({
  me: protectedProcedure.query(({ ctx }) => core.users.getUserById(ctx.actor.id)),

  updateProfile: protectedProcedure
    .input(z.custom<core.users.UpdateUserInput>(isPlainObject))
    .mutation(({ ctx, input }) => core.users.updateUser(ctx.actor, input)),

  list: adminProcedure.query(({ ctx }) => core.users.listUsers(ctx.actor)),

  pending: adminProcedure.query(({ ctx }) => core.users.listPendingUsers(ctx.actor)),

  approve: adminProcedure
    .input(z.string())
    .mutation(({ ctx, input }) => core.users.approveUser(ctx.actor, input)),

  reject: adminProcedure
    .input(z.string())
    .mutation(({ ctx, input }) => core.users.rejectUser(ctx.actor, input)),

  delete: adminProcedure
    .input(z.string())
    .mutation(({ ctx, input }) => core.users.deleteUser(ctx.actor, input)),

  register: publicProcedure
    .input(z.custom<core.users.RegisterUserInput>(isPlainObject))
    .mutation(({ input }) => core.users.registerUser(input)),

  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Anti-enumeration: core returns null for malformed/unknown/unapproved/
      // throttled — this branch only decides whether to send, never the
      // response, so the client always sees the same neutral result.
      const issued = await core.users.requestPasswordReset(input.email);
      if (issued) {
        const link = core.buildResetLink(ctx.passwordResetBase, issued.rawToken);
        const { subject, html, text } = core.buildPasswordResetEmail(link);
        await ctx.email.send({ to: issued.to, subject, html, text });
      }
      return { sent: true } as const;
    }),

  resetPassword: publicProcedure
    .input(z.object({ token: z.string().min(1), newPassword: z.string().min(6) }))
    .mutation(({ input }) => core.users.resetPassword(input.token, input.newPassword)),

  checkResetToken: publicProcedure
    .input(z.string())
    .query(({ input }) => core.users.checkResetToken(input)),
});
