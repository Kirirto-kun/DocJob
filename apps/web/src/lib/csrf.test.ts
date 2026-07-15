/**
 * Unit tests for `assertSameOrigin` (SP-4a T5, corrected). No DB/Postgres
 * needed — this guard only inspects request headers.
 *
 * The exemption is keyed on Origin/Referer **presence**, not on whether a
 * `cookie` header is attached (see `./csrf.ts`'s doc comment for the full
 * rationale): a cookie-absence-only exemption is sound against forgeries on
 * an *existing* session (which need an ambient cookie to ride), but not
 * against forgeries that *create* a session — a cross-origin, cookieless
 * `/api/auth/login` POST would mint a session under the attacker's identity
 * in the victim's browser (login CSRF), and a cross-origin, cookieless
 * `/api/auth/logout` POST would clear the victim's cookies (forced-logout).
 * Both must be blocked whenever a mismatched Origin/Referer is present,
 * regardless of cookie status. Only a request with NEITHER an Origin/Referer
 * NOR a cookie — the native/mobile-client shape — is exempt.
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

  it('blocks a cookieless cross-origin POST with a mismatched Origin (e.g. login CSRF / forced-logout)', () => {
    process.env.AUTH_URL = 'https://docjob.example';
    const req = new Request('https://docjob.example/api/auth/login', {
      method: 'POST',
      headers: {
        origin: 'https://evil.example',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: 'victim@example.com', password: 'attacker-controlled' }),
    });

    const result = assertSameOrigin(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it('exempts a cookieless request with NO Origin/Referer at all (native/mobile client)', () => {
    process.env.AUTH_URL = 'https://docjob.example';
    const req = new Request('https://docjob.example/api/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh: 'some-raw-refresh-token' }),
    });

    expect(assertSameOrigin(req)).toBeNull();
  });

  it('exempts a cookieless request carrying a Bearer header and no Origin (unchanged prior behavior)', () => {
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
