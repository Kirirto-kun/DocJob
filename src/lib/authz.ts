import type { Case, User } from '@prisma/client';

export class AuthzError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthzError';
  }
}

/**
 * Case mutation policy: the author can modify their own cases; ADMIN can
 * modify any case. Extracted for reuse by future chat-feature mutations
 * (unlocking new findings, grading submissions) that also pivot on the
 * acting user's relationship to the case.
 */
export function canMutateCase(user: Pick<User, 'id' | 'role'>, caseRecord: Pick<Case, 'authorId'>): boolean {
  return user.role === 'ADMIN' || user.id === caseRecord.authorId;
}

export function assertCanMutateCase(user: Pick<User, 'id' | 'role'>, caseRecord: Pick<Case, 'authorId'>): void {
  if (!canMutateCase(user, caseRecord)) {
    throw new AuthzError('Недостаточно прав для изменения этого кейса.');
  }
}
