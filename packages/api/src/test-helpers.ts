import type { EmailSender } from '@docjob/core';

/**
 * No-op `EmailSender` for router/context tests that build an `ApiContext`
 * literal directly (bypassing `createContext`) and don't exercise the
 * contact-email send path — `ApiContext.email` is required (SP-4a Task 2),
 * so every such literal needs *some* sender; this is a shared stand-in
 * rather than repeating `{ send: async () => {} }` at each call site.
 */
export const noopEmailSender: EmailSender = { send: async () => {} };

/**
 * Fixture values for `ApiContext.passwordResetBase` / `.contactInboxEmail`
 * (SP-4a Task 3) — required fields, so every test-built `ApiContext` literal
 * needs *some* value even when the test doesn't exercise password reset or
 * contact delivery. Shared here for the same reason `noopEmailSender` is.
 */
export const testPasswordResetBase = 'http://localhost:3000';
export const testContactInboxEmail = 'inbox@test';
