import { describe, expect, it } from 'vitest';
import { normalizePublicAppUrl } from './mobile-app-links';

describe('normalizePublicAppUrl', () => {
  it('normalizes a valid HTTPS store link', () => {
    expect(normalizePublicAppUrl('  https://play.google.com/store/apps/details?id=kz.docjob  ')).toBe(
      'https://play.google.com/store/apps/details?id=kz.docjob',
    );
  });

  it.each([
    undefined,
    '',
    'not-a-url',
    'http://play.google.com/store/apps/details?id=kz.docjob',
    'javascript:alert(1)',
    'https://user:password@example.com/download',
  ])('rejects an unavailable or unsafe value: %s', (value) => {
    expect(normalizePublicAppUrl(value)).toBeNull();
  });
});
