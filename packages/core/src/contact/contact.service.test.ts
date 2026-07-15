/**
 * Unit tests for contact.service — pure logic, no DB, no email transport.
 * Runs fine without Postgres (unlike most other core domain tests in this
 * SP-1b pass).
 */
import { describe, it, expect, vi } from 'vitest';
import { ValidationError } from '../shared/errors';
import type { EmailMessage } from '../shared/email-port';
import * as contact from './contact.service';
import { parseContactMessage } from './contact.service';

describe('contact.service', () => {
  it('parses a valid message', () => {
    const result = parseContactMessage({
      name: '  Иван Иванов  ',
      email: '  ivan@example.com ',
      message: '  Здравствуйте, есть вопрос.  ',
    });
    expect(result).toEqual({
      name: 'Иван Иванов',
      email: 'ivan@example.com',
      message: 'Здравствуйте, есть вопрос.',
      isHoneypot: false,
    });
  });

  it('flags a filled honeypot field without altering the parsed content', () => {
    const result = parseContactMessage({
      name: 'Bot',
      email: 'bot@example.com',
      message: 'spam',
      company: 'Acme Corp',
    });
    expect(result.isHoneypot).toBe(true);
    expect(result.name).toBe('Bot');
  });

  it('does not treat a blank honeypot field as filled', () => {
    const result = parseContactMessage({
      name: 'Real User',
      email: 'user@example.com',
      message: 'hi',
      company: '   ',
    });
    expect(result.isHoneypot).toBe(false);
  });

  it('throws ValidationError for an empty name', () => {
    expect(() =>
      parseContactMessage({ name: '', email: 'a@b.com', message: 'hi' }),
    ).toThrow(ValidationError);
  });

  it('throws ValidationError for an invalid email', () => {
    expect(() =>
      parseContactMessage({ name: 'A', email: 'not-an-email', message: 'hi' }),
    ).toThrow(ValidationError);
  });

  it('throws ValidationError for an empty message', () => {
    expect(() =>
      parseContactMessage({ name: 'A', email: 'a@b.com', message: '' }),
    ).toThrow(ValidationError);
  });

  it('throws ValidationError with the exact preserved Russian message', () => {
    expect(() =>
      parseContactMessage({ name: '', email: 'a@b.com', message: 'hi' }),
    ).toThrow('Проверьте правильность заполнения формы.');
  });

  it('rejects a name over 100 chars', () => {
    expect(() =>
      parseContactMessage({ name: 'a'.repeat(101), email: 'a@b.com', message: 'hi' }),
    ).toThrow(ValidationError);
  });

  it('rejects a message over 2000 chars', () => {
    expect(() =>
      parseContactMessage({ name: 'A', email: 'a@b.com', message: 'a'.repeat(2001) }),
    ).toThrow(ValidationError);
  });
});

describe('contact.service — sendContactMessage (injected EmailSender)', () => {
  it('sendContactMessage delivers a valid message exactly once', async () => {
    const send = vi.fn(async (_msg: EmailMessage) => {});
    const res = await contact.sendContactMessage(
      { name: 'Ann', email: 'a@b.test', message: 'Hello there team', company: '' },
      { email: { send }, inboxEmail: 'inbox@test' },
    );
    expect(res).toEqual({ sent: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].subject).toBeTruthy();
    expect(send.mock.calls[0][0].to).toBe('inbox@test');
  });

  it('sendContactMessage drops honeypot submissions without sending', async () => {
    const send = vi.fn(async () => {});
    const res = await contact.sendContactMessage(
      { name: 'Bot', email: 'bot@b.test', message: 'spam spam spam', company: 'ACME' },
      { email: { send }, inboxEmail: 'inbox@test' },
    );
    expect(res).toEqual({ sent: true });
    expect(send).not.toHaveBeenCalled();
  });
});
