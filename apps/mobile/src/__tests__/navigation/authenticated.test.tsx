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

const approvedUser = {
  id: 'u1',
  approvedAt: '2024-01-01T00:00:00.000Z',
} as unknown as SerializedUser;

describe('root navigation gate: authenticated', () => {
  it(
    'routes an authenticated (approved) session straight to the tab bar, with all 5 tabs mounted',
    async () => {
      mockedFetchMe.mockResolvedValue(approvedUser);

      renderRouter('./app', { initialUrl: '/' });

      await waitFor(() => expect(screen.getByTestId('search-screen')).toBeTruthy(), {
        timeout: 5000,
      });
      // Each label also doubles as the header title, hence `getAllByText`
      // rather than `getByText` — proves the full 5-tab shell mounted, not
      // just the active screen's content.
      expect(screen.getAllByText('Поиск').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Кейсы').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Сохранённые').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Мои заявки').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Профиль').length).toBeGreaterThan(0);
      expect(screen.queryByTestId('login-screen')).toBeNull();
      expect(screen.queryByTestId('pending-screen')).toBeNull();
    },
    10000,
  );
});
