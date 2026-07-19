import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@docjob/auth/tokens', () => ({
  verifyAccessToken: vi.fn(),
}));

vi.mock('@/lib/auth-keys', () => ({
  verificationKeys: vi.fn(),
}));

import middleware from './middleware';

describe('middleware public metadata routes', () => {
  it.each(['/robots.txt', '/sitemap.xml'])(
    'allows anonymous access to %s without redirecting to login',
    async (pathname) => {
      const request = new NextRequest(`https://docjob.kz${pathname}`);
      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('x-middleware-next')).toBe('1');
    },
  );
});
