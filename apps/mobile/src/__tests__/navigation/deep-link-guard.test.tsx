import { describe, it, expect, jest } from '@jest/globals';
import { renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as authClient from '../../lib/auth-client';

/**
 * See `unauthenticated.test.tsx` for why this is a standalone file (one
 * `renderRouter` scenario per file — `expo-router`'s router-store singleton
 * doesn't reset cleanly between multiple `renderRouter()` calls in one
 * file) and why `waitFor` needs a generous explicit timeout.
 *
 * This test covers `(tabs)/_layout.tsx`'s OWN defensive guard specifically
 * (not just the `/` gateway's redirect): a stale deep link or restored nav
 * state landing directly inside `(tabs)` while unauthenticated must still
 * bounce to login, not just the initial `/` visit.
 */
jest.mock('../../lib/auth-client', () => ({
  __esModule: true,
  fetchMe: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  onLogout: jest.fn(() => () => {}),
}));

const mockedFetchMe = authClient.fetchMe as jest.MockedFunction<typeof authClient.fetchMe>;

describe('root navigation gate: deep-link guard', () => {
  it(
    'a direct deep link into (tabs) while unauthenticated is bounced to login',
    async () => {
      mockedFetchMe.mockResolvedValue(null);

      renderRouter('./app', { initialUrl: '/(tabs)/search' });

      await waitFor(() => expect(screen.getByTestId('login-screen')).toBeTruthy(), {
        timeout: 5000,
      });
      expect(screen.queryByTestId('search-screen')).toBeNull();
    },
    10000,
  );
});
