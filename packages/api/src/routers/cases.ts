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
 * structureFromMarkdown = adminProcedure. Core's `updateCase` was tightened
 * to `assertAdmin` in a security-hardening pass (previously only
 * `assertApproved`, a pre-existing gap — see SP-1b Task 2 follow-up in
 * .superpowers/sdd/progress.md), so this router now matches core 1:1 for
 * every case mutation, same as `create`/`delete` already did.
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

  // create/update fire-and-forget the case embedding upsert after the write
  // succeeds — moved here verbatim from the (now-retired) `createCase`/
  // `updateCase` Server Actions (SP-2 Task 3) so every caller (web tRPC
  // hooks AND the in-process server caller) gets the same behavior, instead
  // of duplicating this side effect at every transport call site. Guarded
  // internally (embeddings.ts): a missing OPENAI_API_KEY or any embedding
  // error is logged and swallowed, never surfaced to the caller.
  create: adminProcedure
    .input(z.custom<core.cases.CreateCaseInput>(isPlainObject))
    .mutation(async ({ ctx, input }) => {
      const data = await core.cases.createCase(ctx.actor, input);
      void core.search.upsertCaseEmbedding(data.id).catch(() => {});
      return data;
    }),

  update: adminProcedure
    .input(z.custom<core.cases.UpdateCaseInput>(isPlainObject))
    .mutation(async ({ ctx, input }) => {
      const data = await core.cases.updateCase(ctx.actor, input);
      void core.search.upsertCaseEmbedding(data.id).catch(() => {});
      return data;
    }),

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
