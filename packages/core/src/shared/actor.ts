import type { Role } from '@docjob/db';
import { ForbiddenError, UnauthorizedError } from './errors';

/**
 * The minimal authenticated-caller shape domain services need. Transport
 * layers (server actions, API routes) are responsible for building this
 * from their own session mechanism (NextAuth, etc.) before calling into
 * @docjob/core.
 */
export type Actor = {
  id: string;
  role: Role;
  approvedAt: Date | null;
};

/**
 * Requires a logged-in, approved actor.
 * Throws UnauthorizedError if there is no actor (not logged in).
 * Throws ForbiddenError if the actor exists but hasn't been approved yet.
 */
export function assertApproved(actor: Actor | null): Actor {
  if (!actor) throw new UnauthorizedError();
  if (!actor.approvedAt) throw new ForbiddenError('Account not approved');
  return actor;
}

/**
 * Requires a logged-in actor with the ADMIN role.
 * Throws UnauthorizedError if there is no actor.
 * Throws ForbiddenError if the actor is not an admin.
 */
export function assertAdmin(actor: Actor | null): Actor {
  if (!actor) throw new UnauthorizedError();
  if (actor.role !== 'ADMIN') throw new ForbiddenError('Admin role required');
  return actor;
}

/**
 * Requires a logged-in actor with the ADMIN or REVIEWER role.
 * Throws UnauthorizedError if there is no actor.
 * Throws ForbiddenError if the actor is neither admin nor reviewer.
 */
export function assertReviewer(actor: Actor | null): Actor {
  if (!actor) throw new UnauthorizedError();
  if (actor.role !== 'ADMIN' && actor.role !== 'REVIEWER') {
    throw new ForbiddenError('Reviewer role required');
  }
  return actor;
}
