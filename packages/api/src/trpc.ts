import { initTRPC, TRPCError } from '@trpc/server';
import {
  DomainError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ConflictError,
} from '@docjob/core';
import type { ApiContext } from './context';

/**
 * tRPC v11 init, scoped to `ApiContext` (see context.ts). No `transformer`
 * yet — every domain router landing in later SP-1d tasks uses plain JSON-
 * serializable inputs/outputs, so the default is fine; revisit if a router
 * ever needs to move `Date`/`Map`/etc. across the wire untransformed.
 */
const t = initTRPC.context<ApiContext>().create();

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const middleware = t.middleware;

/**
 * Maps @docjob/core's transport-agnostic `DomainError` hierarchy onto tRPC
 * error codes. Domain services (case.service, user.service, ...) throw
 * plain `DomainError` subclasses with no knowledge of tRPC; this middleware
 * is the single place that translates them for the wire.
 *
 * Note this package's installed @trpc/server (v11) does NOT propagate
 * downstream errors as a rejected `next()` promise — every recursion level
 * in tRPC's internal procedure caller catches a thrown error where it
 * occurs and converts it into a `{ ok: false, error: TRPCError }` result
 * that is *returned* (not re-thrown) up the chain; only the outermost
 * caller does a final `throw`. A `try/catch` wrapped around `await next()`
 * therefore never fires here — the failure has to be read off the
 * settled result instead (`result.ok === false`), with the original
 * `DomainError` recovered from `result.error.cause` (tRPC's own
 * `getTRPCErrorFromUnknown` stashes whatever was thrown there when it
 * auto-wraps a non-TRPCError as `INTERNAL_SERVER_ERROR`).
 *
 * Anything that isn't a recognized `DomainError` (a bare TRPCError like the
 * UNAUTHORIZED/FORBIDDEN ones `protectedProcedure`/`reviewerProcedure`/
 * `adminProcedure` throw directly below, a real bug, a Prisma error, ...) is
 * rethrown as-is so tRPC's default handling/logging applies — never mapped
 * to a fake domain error code.
 */
const errorMapping = t.middleware(async ({ next }) => {
  const result = await next();
  if (result.ok) return result;

  const cause = result.error.cause;
  if (cause instanceof UnauthorizedError) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: cause.message, cause });
  }
  if (cause instanceof ForbiddenError) {
    throw new TRPCError({ code: 'FORBIDDEN', message: cause.message, cause });
  }
  if (cause instanceof NotFoundError) {
    throw new TRPCError({ code: 'NOT_FOUND', message: cause.message, cause });
  }
  if (cause instanceof ValidationError) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: cause.message, cause });
  }
  if (cause instanceof ConflictError) {
    throw new TRPCError({ code: 'CONFLICT', message: cause.message, cause });
  }
  if (cause instanceof DomainError) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: cause.message, cause });
  }
  throw result.error;
});

/** Base procedure every other procedure tier builds on — carries the error-mapping middleware. */
const baseProcedure = t.procedure.use(errorMapping);

/** No auth requirement. Still gets error mapping. */
export const publicProcedure = baseProcedure;

/**
 * Requires a resolved actor (see context.ts). Narrows `ctx.actor` to
 * non-null for downstream procedures/resolvers, so `reviewerProcedure` /
 * `adminProcedure` and route handlers don't need their own null check.
 *
 * Deliberately does NOT check `approvedAt` or any other fine-grained rule —
 * that stays in `@docjob/core`'s `assertApproved`/`assertAdmin`/
 * `assertReviewer` helpers, called by the domain services themselves. This
 * procedure only answers "is *someone* logged in?".
 */
export const protectedProcedure = baseProcedure.use(({ ctx, next }) => {
  if (!ctx.actor) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, actor: ctx.actor } });
});

/** Requires an ADMIN or REVIEWER actor. */
export const reviewerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.actor.role !== 'ADMIN' && ctx.actor.role !== 'REVIEWER') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next();
});

/** Requires an ADMIN actor. */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.actor.role !== 'ADMIN') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next();
});
