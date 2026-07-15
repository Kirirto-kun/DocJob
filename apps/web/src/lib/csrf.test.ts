/**
 * Unit tests for `assertSameOrigin` (SP-4a T5). No DB/Postgres needed — this
 * guard only inspects request headers.
 *
 * The exemption was relaxed from "Bearer header present AND no cookie" to
 * simply "no `cookie` header present" (see `./csrf.ts`'s doc comment): CSRF
 * only works because a browser automatically attaches a victim's cookies to
 * a cross-site request, so any request with no cookie header at all — with
 * or without a Bearer header, with or without a refresh-token body/header —
 * carries no ambient credential and cannot be a forgery. This is what makes
 * the cookieless mobile-transport refresh/logout calls (which carry neither
 * a cookie nor a Bearer header — the refresh token travels in the body)
 * pass through unblocked.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { assertSameOrigin } from './csrf';

const ORIGINAL_AUTH_URL = process.env.AUTH_URL;

describe('assertSameOrigin', () => {
  afterEach(() => {
    process.env.AUTH_URL = ORIGINAL_AUTH_URL;
  });

  it('passes a same-origin, cookie-bearing POST (the normal web flow)', () => {
    process.env.AUTH_URL = 'https://docjob.example';
    const req = new Request('https://docjob.example/api/auth/refresh', {
      method: 'POST',
      headers: {
        cookie: 'docjob-refresh=abc123',
        origin: 'https://docjob.example',
      },
    });

    expect(assertSameOrigin(req)).toBeNull();
  });

  it('blocks a cross-origin, cookie-bearing POST (a forged request riding on the victim\'s cookie)', async () => {
    process.env.AUTH_URL = 'https://docjob.example';
    const req = new Request('https://docjob.example/api/auth/refresh', {
      method: 'POST',
      headers: {
        cookie: 'docjob-refresh=abc123',
        origin: 'https://evil.example',
      },
    });

    const result = assertSameOrigin(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it('blocks a cookie-bearing POST with no Origin/Referer at all', () => {
    process.env.AUTH_URL = 'https://docjob.example';
    const req = new Request('https://docjob.example/api/auth/refresh', {
      method: 'POST',
      headers: { cookie: 'docjob-refresh=abc123' },
    });

    const result = assertSameOrigin(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it('exempts a cookieless cross-origin POST even with a mismatched/absent Origin (mobile refresh/logout, token-in-body)', () => {
    process.env.AUTH_URL = 'https://docjob.example';
    const req = new Request('https://docjob.example/api/auth/refresh', {
      method: 'POST',
      headers: {
        origin: 'https://evil.example',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ refresh: 'some-raw-refresh-token' }),
    });

    expect(assertSameOrigin(req)).toBeNull();
  });

  it('exempts a cookieless request carrying a Bearer header (unchanged prior behavior)', () => {
    process.env.AUTH_URL = 'https://docjob.example';
    const req = new Request('https://docjob.example/api/auth/me', {
      headers: { authorization: 'Bearer some.jwt.token' },
    });

    expect(assertSameOrigin(req)).toBeNull();
  });

  it('exempts a cookieless request with neither a Bearer header nor a body token (bare GET-style check)', () => {
    process.env.AUTH_URL = 'https://docjob.example';
    const req = new Request('https://docjob.example/api/auth/refresh', { method: 'POST' });

    expect(assertSameOrigin(req)).toBeNull();
  });
});
