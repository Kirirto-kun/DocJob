import type { EmailSender } from '@docjob/core';

/**
 * No-op `EmailSender` for router/context tests that build an `ApiContext`
 * literal directly (bypassing `createContext`) and don't exercise the
 * contact-email send path — `ApiContext.email` is required (SP-4a Task 2),
 * so every such literal needs *some* sender; this is a shared stand-in
 * rather than repeating `{ send: async () => {} }` at each call site.
 */
export const noopEmailSender: EmailSender = { send: async () => {} };
