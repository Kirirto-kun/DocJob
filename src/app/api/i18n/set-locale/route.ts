import { NextResponse } from 'next/server';
import { LOCALE_COOKIE, isLocale } from '@/i18n/config';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: { locale?: unknown };
  try {
    body = (await req.json()) as { locale?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!isLocale(body.locale)) {
    return NextResponse.json({ error: 'Invalid locale' }, { status: 400 });
  }

  const res = NextResponse.json({ locale: body.locale });
  res.cookies.set(LOCALE_COOKIE, body.locale, {
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
