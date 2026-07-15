/**
 * Integration tests for the `contact` tRPC router. No DB fixtures needed —
 * `core.contact.sendContactMessage` is pure aside from the injected
 * `EmailSender` (no Prisma, no direct network I/O), so these run against
 * `appRouter.createCaller({ actor: null, email })` only, same harness style
 * as the other routers (see reviews.test.ts) minus the Postgres setup/
 * teardown.
 *
 * SP-4a Task 2 update: `send` now actually delivers mail via `ctx.email`
 * (see contact.ts's doc comment). The first block below uses a no-op sender
 * (delivery isn't the point of those assertions); the second block injects a
 * `vi.fn` spy to assert delivery happens for a valid message and is skipped
 * for a honeypot-tripped one — mirroring the honeypot test from
 * `packages/core/src/contact/contact.service.test.ts` but driven through the
 * actual tRPC caller (the same path a mobile/tRPC-only client would take,
 * with no Server Action fallback).
 */
import { describe, it, expect, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import type { EmailMessage } from '@docjob/core';
import { appRouter } from '../root';
import { createCallerFactory } from '../trpc';
import { noopEmailSender, testPasswordResetBase, testContactInboxEmail } from '../test-helpers';

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
  const caller = createCaller({ email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail, actor: null });

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

describe('contact router — email delivery via injected EmailSender (SP-4a Task 2)', () => {
  it('send with a valid payload calls the injected sender exactly once', async () => {
    const send = vi.fn(async (_msg: EmailMessage) => {});
    const caller = createCaller({
      actor: null,
      email: { send },
      passwordResetBase: testPasswordResetBase,
      contactInboxEmail: testContactInboxEmail,
    });

    const result = await caller.contact.send({
      name: 'Jane Doctor',
      email: 'jane@example.com',
      message: 'I have a question about DocJob.',
    });

    expect(result).toEqual({ sent: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].subject).toBeTruthy();
    // SP-4a Task 3 follow-up: the recipient comes from ctx.contactInboxEmail
    // (injected), not a hardcoded core constant.
    expect(send.mock.calls[0][0].to).toBe(testContactInboxEmail);
  });

  it('send with the honeypot field filled resolves { sent: true } without calling the sender', async () => {
    const send = vi.fn(async (_msg: EmailMessage) => {});
    const caller = createCaller({
      actor: null,
      email: { send },
      passwordResetBase: testPasswordResetBase,
      contactInboxEmail: testContactInboxEmail,
    });

    const result = await caller.contact.send({
      name: 'Bot',
      email: 'bot@example.com',
      message: 'Buy cheap watches now.',
      company: 'I am a bot and filled this hidden field',
    });

    expect(result).toEqual({ sent: true });
    expect(send).not.toHaveBeenCalled();
  });
});
