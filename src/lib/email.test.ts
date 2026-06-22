import { describe, it, expect } from 'vitest';
import { buildPasswordResetEmail, buildContactEmail } from './email';

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

describe('buildContactEmail', () => {
  const input = { name: 'Иван', email: 'ivan@example.com', message: 'Здравствуйте, есть вопрос.' };

  it('includes name, email and message in text and html', () => {
    const { text, html } = buildContactEmail(input);
    for (const v of [input.name, input.email, input.message]) {
      expect(text).toContain(v);
      expect(html).toContain(v);
    }
  });

  it('has a non-empty subject', () => {
    expect(buildContactEmail(input).subject.length).toBeGreaterThan(0);
  });

  it('escapes HTML in user input to prevent injection', () => {
    const { html } = buildContactEmail({ ...input, name: '<script>x</script>' });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
