import { describe, it, expect, jest } from '@jest/globals';
import { renderRouter, screen, waitFor } from 'expo-router/testing-library';
import type { SerializedUser } from '../../lib/api-types';
import * as authClient from '../../lib/auth-client';

/**
 * See `unauthenticated.test.tsx` for why this is a standalone file (one
 * `renderRouter` scenario per file) and why `waitFor` needs a generous
 * explicit timeout.
 *
 * Covers the SP-4b Task 3 bugfix (Fix 2, `app/(tabs)/_layout.tsx`): before
 * the fix, that layout redirected to `/(auth)/login` for ANY non-
 * `'authenticated'` status. Since `status` always starts `'loading'` on
 * mount (before `fetchMe()`'s effect even runs), a deep link straight into
 * a `(tabs)` route (push notification, restored nav state, universal link)
 * ALWAYS hit that redirect on the very first render — even when `fetchMe`
 * would go on to resolve `'authenticated'` almost immediately. Once
 * `(auth)/_layout.tsx`'s own effect then observed `'authenticated'`, it
 * redirected to the hard-coded default `/(tabs)/search` — never back to the
 * originally requested `/(tabs)/saved` — permanently losing the
 * destination. The fix adds a `status === 'loading'` branch BEFORE the
 * redirect, so the layout waits instead of bouncing, and lands directly on
 * the requested tab once `status` resolves.
 *
 * A genuinely-pending `fetchMe()` (manually resolved mid-test) was tried
 * here first to also assert the transient loading render, but proved
 * incompatible with `renderRouter`'s fake-timer-driven scheduler (the
 * resulting state update never flushed even after repeated manual
 * microtask/`waitFor` flushing) — see `tabs-layout.test.tsx` for the
 * fallback direct-component coverage of that loading branch instead (per
 * this task's own guidance for when the full-router simulation is hard).
 * This test instead uses the same immediately-resolving `mockResolvedValue`
 * pattern as every sibling `renderRouter` test and asserts the
 * OBSERVABLE end state, which is still a valid regression test: the pre-fix
 * code redirects to login unconditionally on the very first render (status
 * is `'loading'` before any effect runs), regardless of how fast `fetchMe`
 * later resolves — so the pre-fix behavior lands on `search-screen`
 * (the auth stack's hard-coded default), while the fix lands directly on
 * `saved-screen` (the originally requested tab).
 */
jest.mock('../../lib/auth-client', () => ({
  __esModule: true,
  fetchMe: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  onLogout: jest.fn(() => () => {}),
}));

const mockedFetchMe = authClient.fetchMe as jest.MockedFunction<typeof authClient.fetchMe>;

const approvedUser = {
  id: 'u1',
  approvedAt: '2024-01-01T00:00:00.000Z',
} as unknown as SerializedUser;

describe('root navigation gate: deep link while loading', () => {
  it(
    'a deep link into (tabs)/saved for an authenticated session renders the ORIGINALLY requested tab, not the default search tab (no bounce through login)',
    async () => {
      mockedFetchMe.mockResolvedValue(approvedUser);

      renderRouter('./app', { initialUrl: '/(tabs)/saved' });

      await waitFor(() => expect(screen.getByTestId('saved-screen')).toBeTruthy(), {
        timeout: 5000,
      });
      // The pre-fix bug redirected to login on the initial (still-'loading')
      // render, then landed on the default "search" tab once authenticated
      // — proving neither is on screen is what distinguishes "waited, then
      // rendered the right tab" from "redirected, bounced, and lost the
      // destination".
      expect(screen.queryByTestId('login-screen')).toBeNull();
      expect(screen.queryByTestId('search-screen')).toBeNull();
    },
    10000,
  );
});
