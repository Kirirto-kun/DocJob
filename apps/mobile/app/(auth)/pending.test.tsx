import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import PendingScreen from './pending';
import { useSession, type Session } from '../../src/providers/session';

/**
 * Isolated component test — see `login.test.tsx`'s doc comment for why
 * `useSession` is mocked directly rather than going through
 * `expo-router/testing-library`'s `renderRouter`. `expo-router`'s `router`
 * singleton (used by this screen's logout handler) is also mocked so
 * `router.replace(...)` is a plain assertable spy rather than a real
 * navigation call that needs a mounted router context.
 */
jest.mock('../../src/providers/session', () => ({
  __esModule: true,
  useSession: jest.fn(),
}));

const mockedReplace = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { replace: (...args: unknown[]) => mockedReplace(...args) },
}));

const mockedUseSession = useSession as unknown as jest.Mock;

beforeEach(() => {
  mockedUseSession.mockReset();
  mockedReplace.mockReset();
});

describe('PendingScreen', () => {
  it('renders the waiting-for-approval message and a logout button', async () => {
    mockedUseSession.mockReturnValue({ logout: jest.fn() });

    await render(<PendingScreen />);

    expect(screen.getByTestId('pending-screen')).toBeTruthy();
    expect(screen.getByText(/ожидает одобрения администратора/)).toBeTruthy();
    expect(screen.getByTestId('pending-logout')).toBeTruthy();
  });

  it('tapping "Выйти" calls useSession().logout() and routes back to login', async () => {
    const logout = jest.fn() as jest.MockedFunction<Session['logout']>;
    logout.mockResolvedValue(undefined);
    mockedUseSession.mockReturnValue({ logout });

    await render(<PendingScreen />);
    await fireEvent.press(screen.getByTestId('pending-logout'));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockedReplace).toHaveBeenCalledWith('/(auth)/login'));
  });
});
