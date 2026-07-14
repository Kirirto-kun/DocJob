/**
 * Integration tests for the `contact` tRPC router. No DB fixtures needed —
 * `core.contact.parseContactMessage` is pure (no Prisma, no network I/O),
 * so these run against `appRouter.createCaller({ actor: null })` only, same
 * harness style as the other routers (see reviews.test.ts) minus the
 * Postgres setup/teardown.
 *
 * Per contact.ts's doc comment: this router validates + evaluates the
 * honeypot only. It does NOT send real email (that stays out of
 * `@docjob/api`'s boundary) — these tests deliberately do NOT assert that
 * any email was sent, only that `send` resolves with `{ sent: true }` (or
 * rejects for invalid input).
 */
import { describe, it, expect } from 'vitest';
import { TRPCError } from '@trpc/server';
import { appRouter } from '../root';
import { createCallerFactory } from '../trpc';

const createCaller = createCallerFactory(appRouter);

async function captureTRPCError(fn: () => Promise<unknown>): Promise<TRPCError> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof TRPCError) return e;
    throw e;
  }
  throw new Error('expected a TRPCError to be thrown');
}

describe('contact router (unit — core.contact is pure, no DB)', () => {
  const caller = createCaller({ actor: null });

  it('send with a valid payload resolves { sent: true }, no actor required', async () => {
    const result = await caller.contact.send({
      name: 'Jane Doctor',
      email: 'jane@example.com',
      message: 'I have a question about DocJob.',
    });
    expect(result).toEqual({ sent: true });
  });

  it('send with the honeypot field filled still resolves { sent: true } (silently dropped)', async () => {
    const result = await caller.contact.send({
      name: 'Bot',
      email: 'bot@example.com',
      message: 'Buy cheap watches now.',
      company: 'I am a bot and filled this hidden field',
    });
    expect(result).toEqual({ sent: true });
  });

  it('send rejects an invalid email with TRPCError BAD_REQUEST', async () => {
    const err = await captureTRPCError(() =>
      caller.contact.send({ name: 'Jane', email: 'not-an-email', message: 'Hello there.' }),
    );
    expect(err.code).toBe('BAD_REQUEST');
  });

  it('send rejects an empty message with TRPCError BAD_REQUEST', async () => {
    const err = await captureTRPCError(() =>
      caller.contact.send({ name: 'Jane', email: 'jane@example.com', message: '' }),
    );
    expect(err.code).toBe('BAD_REQUEST');
  });
});
