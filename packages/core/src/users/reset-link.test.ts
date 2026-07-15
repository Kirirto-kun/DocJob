import { describe, it, expect } from 'vitest';
import { buildResetLink } from './reset-link';

describe('buildResetLink', () => {
  it('builds a reset URL, stripping a trailing slash and encoding the token', () => {
    expect(buildResetLink('https://app.docjob.test/', 'a b/c')).toBe('https://app.docjob.test/reset-password?token=a%20b%2Fc');
  });
  it('works without a trailing slash', () => {
    expect(buildResetLink('https://app.docjob.test', 'tok')).toBe('https://app.docjob.test/reset-password?token=tok');
  });
});
