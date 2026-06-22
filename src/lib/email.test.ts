import { describe, it, expect } from 'vitest';
import { buildPasswordResetEmail } from './email';

describe('buildPasswordResetEmail', () => {
  const url = 'https://docjob.kz/reset-password?token=abc123';

  it('includes the reset url in both html and text', () => {
    const { html, text } = buildPasswordResetEmail(url);
    expect(html).toContain(url);
    expect(text).toContain(url);
  });

  it('has a non-empty subject', () => {
    expect(buildPasswordResetEmail(url).subject.length).toBeGreaterThan(0);
  });
});
