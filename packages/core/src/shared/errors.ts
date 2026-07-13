/**
 * Typed domain errors for @docjob/core.
 *
 * Transport-agnostic — server actions / API routes are responsible for
 * mapping these to whatever shape the caller expects (e.g. ActionResult).
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

/** Not logged in (no actor / no session). */
export class UnauthorizedError extends DomainError {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/** Logged in, but not allowed to perform this action. */
export class ForbiddenError extends DomainError {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/** Requested entity does not exist (or is not visible to this actor). */
export class NotFoundError extends DomainError {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** Input failed validation. */
export class ValidationError extends DomainError {
  constructor(message = 'Validation failed') {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Action conflicts with current state (e.g. duplicate, stale state). */
export class ConflictError extends DomainError {
  constructor(message = 'Conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}
