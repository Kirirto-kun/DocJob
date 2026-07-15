import { NextRequest, NextResponse } from 'next/server';
import { login, createInMemoryLimiter } from '@docjob/auth';
import { assertSameOrigin } from '@/lib/csrf';
import { setAuthCookies } from '@/lib/auth-cookies';
import { signingKey } from '@/lib/auth-keys';

// Node runtime: `auth.login` touches Prisma and runs an argon2id verify,
// neither of which is Edge-safe.
export const runtime = 'nodejs';

/**
 * Module-singleton limiter, mirroring `@docjob/auth`'s own default — kept
 * explicit here (rather than relying on that internal default) so the
 * limiter instance is unambiguous and test-visible from the web side. Backed
 * by an in-process `Map`; see rate-limit.ts's doc comment re: SP-5's planned
 * Redis swap.
 */
const limiter = createInMemoryLimiter();

function clientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  return '127.0.0.1';
}

export async function POST(req: NextRequest) {
  const csrfFailure = assertSameOrigin(req);
  if (csrfFailure) return csrfFailure;

  let body: { email?: unknown; password?: unknown; deviceLabel?: unknown };
  try {
    body = (await req.json()) as { email?: unknown; password?: unknown; deviceLabel?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body.email !== 'string' || typeof body.password !== 'string') {
    return NextResponse.json({ error: 'email and password are required' }, { status: 400 });
  }
  const deviceLabel = typeof body.deviceLabel === 'string' ? body.deviceLabel : undefined;

  const result = await login(
    { email: body.email, password: body.password, ip: clientIp(req), deviceLabel },
    signingKey(),
    limiter,
  );

  switch (result.status) {
    case 'ok': {
      // The body also carries the raw tokens (in addition to the cookies
      // below) so a mobile/native client — which never receives the
      // httpOnly cookies at all — can read `access`/`refresh` directly. This
      // is the SAME token pair minted above, not a second mint: exactly one
      // successful response ever carries the raw refresh token.
      const res = NextResponse.json({
        user: result.user,
        access: result.access,
        refresh: result.refresh,
        refreshExpiresAt: result.refreshExpiresAt,
      });
      setAuthCookies(res, {
        access: result.access,
        refresh: result.refresh,
        refreshExpiresAt: result.refreshExpiresAt,
      });
      return res;
    }
    case 'pending':
      // Credentials were correct but the account isn't admin-approved yet.
      // Never issues tokens.
      return NextResponse.json({ status: 'pending' }, { status: 401 });
    case 'invalid':
      // Unknown email or wrong password — deliberately indistinguishable
      // from `pending` at the network-timing level (see login.service.ts).
      return NextResponse.json({ status: 'invalid' }, { status: 401 });
    case 'locked':
      return NextResponse.json(
        { status: 'locked', retryAfterSeconds: result.retryAfterSeconds },
        { status: 429 },
      );
  }
}
