import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { authConfig } from '@/lib/auth.config';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from '@/i18n/config';

const { auth: edgeAuth } = NextAuth(authConfig);

const PUBLIC_PATHS = ['/login', '/register', '/landing'];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith('/legal/')) return true;
  if (pathname.startsWith('/api/auth')) return true;
  if (pathname.startsWith('/api/images/')) return true;
  if (pathname.startsWith('/api/i18n/')) return true;
  if (pathname.startsWith('/_next')) return true;
  if (pathname === '/favicon.ico') return true;
  return false;
}

function ensureLocaleCookie(req: NextRequest, res: NextResponse): NextResponse {
  const existing = req.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(existing)) return res;

  const accept = req.headers.get('accept-language') ?? '';
  const preferred = accept.toLowerCase().includes('kk') ? 'kk' : DEFAULT_LOCALE;
  res.cookies.set(LOCALE_COOKIE, preferred, {
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

export default edgeAuth((req: NextRequest & { auth: unknown }) => {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) {
    return ensureLocaleCookie(req, NextResponse.next());
  }
  if (!req.auth) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return ensureLocaleCookie(req, NextResponse.redirect(loginUrl));
  }
  return ensureLocaleCookie(req, NextResponse.next());
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
