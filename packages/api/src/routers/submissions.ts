import { z } from 'zod';
import * as core from '@docjob/core';
import { protectedProcedure, adminProcedure, router } from '../trpc';

/**
 * `submissions` tRPC router — thin wire wrappers over `@docjob/core`'s
 * `submissions.*` domain functions
 * (packages/core/src/submissions/submission.service.ts). Every procedure
 * forwards `(ctx.actor, input)` into the matching core function; all
 * business rules (fine-grained auth, field validation, NotFound/Forbidden/
 * Validation) live in core and surface here only via the DomainError ->
 * TRPCError mapping middleware (see trpc.ts). This router does NOT
 * reimplement any of that (per the SP-1d "parity fix": procedure auth tier
 * mirrors core's own assert exactly, no divergence for this router).
 *
 * Auth tier per procedure, matched 1:1 against the `assert*` call each core
 * function actually makes (read directly off submission.service.ts):
 * - `create`      = protectedProcedure. Core's `createCaseSubmission` calls
 *   `assertApproved` — any approved user may submit a case, no role
 *   restriction.
 * - `sendMessage` = protectedProcedure. Core's `sendCaseSubmissionMessage`
 *   calls `assertApproved` first, then does its own fine-grained
 *   "author or admin" check inline (throws `ForbiddenError` for anyone
 *   else) — that finer check stays in core, not duplicated here.
 * - `mine`        = protectedProcedure. Core's `getMyCaseSubmissions` calls
 *   `assertApproved`.
 * - `all`         = adminProcedure. Core's `getAllCaseSubmissions` calls
 *   `assertAdmin`.
 * - `byId`        = protectedProcedure. Core's `getCaseSubmissionById` calls
 *   `assertApproved` first, then the same inline "author or admin"
 *   fine-grained check as `sendMessage` — left to core.
 * - `updateStatus` = adminProcedure. Core's `updateCaseSubmissionStatus`
 *   calls `assertAdmin`.
 *
 * This matches the pre-existing Server Actions in apps/web/src/app/
 * actions.ts (`createCaseSubmission`, `sendCaseSubmissionMessage`,
 * `getMyCaseSubmissions`, `getAllCaseSubmissions`, `getCaseSubmissionById`,
 * `updateCaseSubmissionStatus`) exactly — no tier is stricter or looser than
 * what those actions already allow, unlike the deliberate `cases`/`tags`
 * divergences noted in their own router doc comments.
 *
 * Input schemas: `create`/`sendMessage` reuse core's own input shapes via
 * `z.custom` (core's internal `safeParse` is the real validator, same
 * rationale as cases.ts/reviews.ts). `byId` takes a bare `id` string, no
 * core-side schema to reuse. `updateStatus` takes `{ submissionId, status }`
 * — `status` has no core-side zod schema (the `CaseSubmission.status` column
 * is a plain Prisma `String`, and core's own function takes it as a bare TS
 * union param with no runtime validation), so this router defines a small
 * local enum mirroring `submission.service.ts`'s internal
 * `SUBMISSION_STATUSES` list, giving the wire boundary real runtime
 * validation the Server Action never needed (a trusted, TS-checked caller).
 */

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const caseSubmissionStatusSchema = z.enum(['new', 'in_review', 'accepted', 'rejected', 'done']);

const updateStatusInputSchema = z.object({
  submissionId: z.string().min(1),
  status: caseSubmissionStatusSchema,
});

export const submissionsRouter = router({
  create: protectedProcedure
    .input(z.custom<core.submissions.CreateCaseSubmissionInput>(isPlainObject))
    .mutation(({ ctx, input }) => core.submissions.createCaseSubmission(ctx.actor, input)),

  sendMessage: protectedProcedure
    .input(z.custom<core.submissions.SendCaseSubmissionMessageInput>(isPlainObject))
    .mutation(({ ctx, input }) => core.submissions.sendCaseSubmissionMessage(ctx.actor, input)),

  mine: protectedProcedure.query(({ ctx }) => core.submissions.getMyCaseSubmissions(ctx.actor)),

  all: adminProcedure.query(({ ctx }) => core.submissions.getAllCaseSubmissions(ctx.actor)),

  byId: protectedProcedure
    .input(z.string())
    .query(({ ctx, input }) => core.submissions.getCaseSubmissionById(ctx.actor, input)),

  updateStatus: adminProcedure
    .input(updateStatusInputSchema)
    .mutation(({ ctx, input }) =>
      core.submissions.updateCaseSubmissionStatus(ctx.actor, input.submissionId, input.status),
    ),
});
