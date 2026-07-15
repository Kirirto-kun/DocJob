import type { EmailSender } from '@docjob/core';
import { appRouter, createCallerFactory } from '@docjob/api';
import { getActor } from '@/lib/action-helpers';
import { sendEmail } from '@/lib/email';

/**
 * Same Resend-backed `EmailSender` adapter the HTTP mount injects (SP-4a
 * Task 2, see `apps/web/src/app/api/trpc/[trpc]/route.ts`) — no Server
 * Component currently calls `contact.send` through this in-process caller,
 * but `ApiContext` requires an `email` regardless, and reusing the real
 * adapter (rather than a no-op) means that changes.
 */
const serverEmailSender: EmailSender = { send: (message) => sendEmail(message) };

/**
 * In-process tRPC caller for Server Components / Server Actions — NO HTTP
 * hop to `/api/trpc`. Builds the same `ApiContext` (`{ actor, email }`)
 * SP-1d's `createContext` builds from a `Request`, but directly from the
 * current request's session via `getActor()` (`@/lib/action-helpers.ts`,
 * itself built on `@/lib/session.ts`'s cookie-verifying `getCurrentUser()`),
 * since a Server Component has no incoming `Request` to hand `createContext`.
 *
 * `createCallerFactory(appRouter)` — NOT `appRouter.createCaller(...)` — is
 * the correct v11 API: the installed `@trpc/server@11.18.0` removed the
 * router-instance `.createCaller()` method entirely (only
 * `createCallerFactory` is exported from `unstable-core-do-not-import`), so
 * a caller must be built via the factory. It's memoized at module scope
 * (built once, not once per call) since it only closes over `appRouter`,
 * not any per-request state.
 *
 * This file has no `'use client'`/`'use server'` directive and is never
 * imported by a client component; `getActor()` → `getCurrentUser()` reads
 * `next/headers`' `cookies()`, which throws outside a server request scope,
 * so any accidental client import fails loudly rather than silently.
 *
 * Usage (Server Component or Server Action):
 *   const caller = await serverCaller();
 *   const cases = await caller.cases.list({ ... });
 */
const createCaller = createCallerFactory(appRouter);

export async function serverCaller() {
  const actor = await getActor();
  return createCaller({ actor, email: serverEmailSender });
}
