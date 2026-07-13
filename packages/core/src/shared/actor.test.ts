import { describe, it, expect } from 'vitest';
import { assertAdmin, assertApproved } from './actor';
import { ForbiddenError, UnauthorizedError } from './errors';

describe('actor guards', () => {
  it('assertApproved throws UnauthorizedError for null', () => {
    expect(() => assertApproved(null)).toThrow(UnauthorizedError);
  });
  it('assertApproved throws ForbiddenError when approvedAt is null', () => {
    expect(() => assertApproved({ id: 'u', role: 'DOCTOR', approvedAt: null })).toThrow(
      ForbiddenError,
    );
  });
  it('assertAdmin allows ADMIN', () => {
    const a = { id: 'u', role: 'ADMIN' as const, approvedAt: new Date() };
    expect(assertAdmin(a)).toBe(a);
  });
  it('assertAdmin throws ForbiddenError for DOCTOR', () => {
    expect(() => assertAdmin({ id: 'u', role: 'DOCTOR', approvedAt: new Date() })).toThrow(
      ForbiddenError,
    );
  });
});
