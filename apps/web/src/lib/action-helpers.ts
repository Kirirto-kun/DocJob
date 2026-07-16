import { DomainError, type Actor } from '@docjob/core';
import { getCurrentUser } from '@/lib/session';
import { logger } from '@/lib/logger';

/**
 * Resolve the current `@docjob/auth` JWT session into the transport-agnostic
 * `Actor` shape `@docjob/core` domain services expect.
 *
 * `getCurrentUser()` (from `@/lib/session`) already verifies the access
 * cookie and does a single `prisma.user.findUnique` — re-reading `role`/
 * `approvedAt` from Postgres rather than trusting the JWT's own claims — and
 * returns the full `User` row, so no extra DB query is needed here.
 */
export async function getActor(): Promise<Actor | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return { id: user.id, role: user.role, approvedAt: user.approvedAt };
}

/**
 * Map a thrown error from a `@docjob/core` domain call into the
 * `ActionResult` failure shape every server action in `actions.ts` returns.
 * `DomainError`s (and subclasses like `NotFoundError`/`ForbiddenError`)
 * carry a user-safe message, so it's surfaced as-is. Anything else is an
 * unexpected bug — logged server-side, never leaked to the client.
 */
export function toActionResult(e: unknown): { success: false; error: string } {
  if (e instanceof DomainError) {
    return { success: false, error: e.message };
  }
  logger.error('unexpected error in server action', { err: e });
  return { success: false, error: 'Что-то пошло не так. Попробуйте позже.' };
}
