import { describe, it, expect, jest } from '@jest/globals';
import { renderRouter, screen, waitFor } from 'expo-router/testing-library';
import type { SerializedUser } from '../../lib/api-types';
import * as authClient from '../../lib/auth-client';

/**
 * See `unauthenticated.test.tsx` for why this is a standalone file (one
 * `renderRouter` scenario per file — `expo-router`'s router-store singleton
 * doesn't reset cleanly between multiple `renderRouter()` calls in one
 * file) and why `waitFor` needs a generous explicit timeout.
 */
jest.mock('../../lib/auth-client', () => ({
  __esModule: true,
  fetchMe: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  onLogout: jest.fn(() => () => {}),
}));

const mockedFetchMe = authClient.fetchMe as jest.MockedFunction<typeof authClient.fetchMe>;

const pendingUser = {
  id: 'u2',
  approvedAt: null,
} as unknown as SerializedUser;

describe('root navigation gate: pending', () => {
  it(
    'routes a pending (unapproved) session to the pending screen, not the tab bar or login',
    async () => {
      mockedFetchMe.mockResolvedValue(pendingUser);

      renderRouter('./app', { initialUrl: '/' });

      await waitFor(() => expect(screen.getByTestId('pending-screen')).toBeTruthy(), {
        timeout: 5000,
      });
      expect(screen.getByTestId('pending-logout')).toBeTruthy();
      expect(screen.queryByTestId('search-screen')).toBeNull();
      expect(screen.queryByTestId('login-screen')).toBeNull();
    },
    10000,
  );
});
