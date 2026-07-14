import { z } from 'zod';
import * as core from '@docjob/core';
import { protectedProcedure, adminProcedure, router } from '../trpc';

/**
 * `cases` tRPC router — thin wire wrappers over `@docjob/core`'s `cases.*`
 * domain functions (packages/core/src/cases/case.service.ts). Every
 * procedure just forwards `(ctx.actor, input)` into the matching core
 * function and returns whatever core returns unchanged; all business rules
 * (fine-grained auth, field validation, NotFound/Forbidden/Validation) live
 * in core and surface here only via the DomainError -> TRPCError mapping
 * middleware (see trpc.ts). This router does NOT reimplement any of that.
 *
 * Auth tier per procedure (enforced at the tRPC layer, on top of whatever
 * core itself asserts): list/listPaged/byId = protectedProcedure (any
 * approved user); create/update/delete/updateAttachment/deleteAttachment/
 * structureFromMarkdown = adminProcedure. This is a deliberate SP-1d
 * decision, not a 1:1 mirror of every pre-existing Server Action's own
 * (looser) gate — e.g. core's `updateCase` only calls `assertApproved`
 * internally (a pre-existing, previously-flagged gap — see SP-1b Task 2
 * follow-up in .superpowers/sdd/progress.md), but this NEW tRPC surface
 * requires admin for all case mutations regardless.
 *
 * Input schemas: where core already owns field-level validation via its own
 * internal zod schema (create/update/updateAttachment/structureFromMarkdown),
 * this router uses `z.custom<CoreInputType>()` instead of re-declaring the
 * shape — the wire boundary only needs to type the payload for the client;
 * the single source of truth for validation stays in case.service.ts /
 * case-import.service.ts. A malformed payload still fails cleanly: core's
 * internal `safeParse` rejects anything that isn't a well-formed object
 * (including non-object input) and throws `ValidationError`, mapped to
 * `TRPCError BAD_REQUEST` by the shared error-mapping middleware — so the
 * `isPlainObject` guard here is just an early, cheap rejection of obviously
 * wrong payloads, not a duplicate of core's validation. `list`'s filters and
 * the plain `id` params have no core-side schema to reuse (core takes them
 * as bare TS params, not through its own zod schema), so they get a small
 * ad-hoc zod shape here instead.
 */

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const listInputSchema = z
  .object({ subgroup: z.string().optional(), specialty: z.string().optional() })
  .optional();

export const casesRouter = router({
  list: protectedProcedure
    .input(listInputSchema)
    .query(({ ctx, input }) => core.cases.listCases(ctx.actor, input)),

  listPaged: protectedProcedure
    .input(z.custom<core.cases.ListCasesPagedInput>(isPlainObject).optional())
    .query(({ ctx, input }) => core.cases.listCasesPaged(ctx.actor, input)),

  byId: protectedProcedure
    .input(z.string())
    .query(({ ctx, input }) => core.cases.getCase(ctx.actor, input)),

  create: adminProcedure
    .input(z.custom<core.cases.CreateCaseInput>(isPlainObject))
    .mutation(({ ctx, input }) => core.cases.createCase(ctx.actor, input)),

  update: adminProcedure
    .input(z.custom<core.cases.UpdateCaseInput>(isPlainObject))
    .mutation(({ ctx, input }) => core.cases.updateCase(ctx.actor, input)),

  delete: adminProcedure
    .input(z.string())
    .mutation(({ ctx, input }) => core.cases.deleteCase(ctx.actor, input)),

  updateAttachment: adminProcedure
    .input(z.custom<core.cases.UpdateCaseAttachmentInput>(isPlainObject))
    .mutation(({ ctx, input }) => core.cases.updateCaseAttachment(ctx.actor, input)),

  deleteAttachment: adminProcedure
    .input(z.string())
    .mutation(({ ctx, input }) => core.cases.deleteCaseAttachment(ctx.actor, input)),

  structureFromMarkdown: adminProcedure
    .input(z.custom<core.cases.StructureCaseInput>(isPlainObject))
    .mutation(({ ctx, input }) => core.cases.structureCaseFromMarkdown(ctx.actor, input)),
});
