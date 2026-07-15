import { describe, it, expect } from 'vitest';
import { TRPCError } from '@trpc/server';
import { ForbiddenError, type Actor } from '@docjob/core';
import {
  router,
  publicProcedure,
  protectedProcedure,
  reviewerProcedure,
  adminProcedure,
  createCallerFactory,
} from './trpc';
import type { ApiContext } from './context';
import { noopEmailSender, testPasswordResetBase, testContactInboxEmail } from './test-helpers';

/**
 * TDD spec for the tRPC v11 base setup: router/procedure factory, the
 * error-mapping middleware, and the four procedure tiers
 * (public/protected/reviewer/admin). These are exercised against a small
 * throwaway test router built with a fake `ApiContext` — no HTTP, no DB.
 */

const adminActor: Actor = { id: 'admin-1', role: 'ADMIN', approvedAt: new Date() };
const reviewerActor: Actor = { id: 'reviewer-1', role: 'REVIEWER', approvedAt: new Date() };
const doctorActor: Actor = { id: 'doctor-1', role: 'DOCTOR', approvedAt: new Date() };

const testRouter = router({
  health: publicProcedure.query(() => ({ ok: true })),
  whoAmI: protectedProcedure.query(({ ctx }) => ({ id: ctx.actor.id })),
  adminOnly: adminProcedure.query(() => ({ ok: true })),
  reviewerOnly: reviewerProcedure.query(() => ({ ok: true })),
  boom: publicProcedure.mutation(() => {
    throw new ForbiddenError('nope, not allowed');
  }),
});

const createCaller = createCallerFactory(testRouter);

function callerWith(actor: Actor | null) {
  const ctx: ApiContext = { actor, email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail };
  return createCaller(ctx);
}

async function captureTRPCError(fn: () => Promise<unknown>): Promise<TRPCError> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof TRPCError) return e;
    throw e;
  }
  throw new Error('expected a TRPCError to be thrown');
}

describe('trpc base setup', () => {
  it('health is a public query returning {ok:true} with no actor', async () => {
    const caller = callerWith(null);
    await expect(caller.health()).resolves.toEqual({ ok: true });
  });

  it('health also works for a logged-in (approved admin) actor', async () => {
    const caller = callerWith(adminActor);
    await expect(caller.health()).resolves.toEqual({ ok: true });
  });

  it('protectedProcedure throws TRPCError UNAUTHORIZED when actor is null', async () => {
    const caller = callerWith(null);
    const err = await captureTRPCError(() => caller.whoAmI());
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('protectedProcedure resolves ctx.actor (non-null) for a logged-in actor', async () => {
    const caller = callerWith(doctorActor);
    await expect(caller.whoAmI()).resolves.toEqual({ id: doctorActor.id });
  });

  it('reviewerProcedure throws UNAUTHORIZED when actor is null', async () => {
    const caller = callerWith(null);
    const err = await captureTRPCError(() => caller.reviewerOnly());
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('reviewerProcedure throws FORBIDDEN for a plain DOCTOR actor', async () => {
    const caller = callerWith(doctorActor);
    const err = await captureTRPCError(() => caller.reviewerOnly());
    expect(err.code).toBe('FORBIDDEN');
  });

  it('reviewerProcedure allows REVIEWER and ADMIN actors through', async () => {
    await expect(callerWith(reviewerActor).reviewerOnly()).resolves.toEqual({ ok: true });
    await expect(callerWith(adminActor).reviewerOnly()).resolves.toEqual({ ok: true });
  });

  it('adminProcedure throws FORBIDDEN for a REVIEWER actor (admin-only, stricter than reviewer)', async () => {
    const caller = callerWith(reviewerActor);
    const err = await captureTRPCError(() => caller.adminOnly());
    expect(err.code).toBe('FORBIDDEN');
  });

  it('adminProcedure allows an ADMIN actor through', async () => {
    await expect(callerWith(adminActor).adminOnly()).resolves.toEqual({ ok: true });
  });

  it('the error-mapping middleware turns a thrown ForbiddenError into TRPCError FORBIDDEN with the original message', async () => {
    const caller = callerWith(null);
    const err = await captureTRPCError(() => caller.boom());
    expect(err.code).toBe('FORBIDDEN');
    expect(err.message).toBe('nope, not allowed');
  });
});
