import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import LoginScreen from './login';
import { useSession, type Session } from '../../src/providers/session';
import type { SerializedUser } from '../../src/lib/api-types';

/**
 * Isolated component test — `useSession` is mocked directly rather than
 * routing this through `expo-router/testing-library`'s `renderRouter`
 * (see `src/__tests__/navigation/*.test.tsx` for the full-tree navigation
 * gate coverage). `fireEvent`+state-update interactions through a full
 * `renderRouter`-mounted tree turned out unreliable in this environment —
 * `fireEvent.changeText`'s `act()` call intermittently didn't commit
 * against the "live" queried instance under `renderRouter`'s fake timers
 * (React Navigation's own background scheduling produces the "overlapping
 * act() calls" warning and appears to interfere) — whereas a plain,
 * router-context-free `render()` of just this screen is fast and exercises
 * the exact same `onSubmit` handler deterministically. `Link` (used for the
 * "register" navigation link) renders fine without a full router context.
 */
jest.mock('../../src/providers/session', () => ({
  __esModule: true,
  useSession: jest.fn(),
}));

const mockedUseSession = useSession as unknown as jest.Mock;

/** A properly-typed `Session['login']` mock, so `.mockResolvedValue(...)` type-checks against the real `LoginResult` union. */
function makeLoginMock(): jest.MockedFunction<Session['login']> {
  return jest.fn() as jest.MockedFunction<Session['login']>;
}

beforeEach(() => {
  mockedUseSession.mockReset();
});

describe('LoginScreen', () => {
  it('renders the email/password fields and submit button', async () => {
    mockedUseSession.mockReturnValue({ login: jest.fn() });

    await render(<LoginScreen />);

    expect(screen.getByTestId('login-screen')).toBeTruthy();
    expect(screen.getByTestId('login-email-input')).toBeTruthy();
    expect(screen.getByTestId('login-password-input')).toBeTruthy();
    expect(screen.getByTestId('login-submit')).toBeTruthy();
  });

  it('submits the entered credentials via useSession().login', async () => {
    const login = makeLoginMock();
    login.mockResolvedValue({ status: 'ok', user: { id: 'u1' } as unknown as SerializedUser });
    mockedUseSession.mockReturnValue({ login });

    await render(<LoginScreen />);

    await fireEvent.changeText(screen.getByTestId('login-email-input'), 'doc@example.com');
    await fireEvent.changeText(screen.getByTestId('login-password-input'), 'secret123');
    await fireEvent.press(screen.getByTestId('login-submit'));

    await waitFor(() => expect(login).toHaveBeenCalledWith('doc@example.com', 'secret123'));
    expect(screen.queryByTestId('login-error')).toBeNull();
  });

  it('shows a Russian "pending approval" message when login() resolves pending', async () => {
    const login = makeLoginMock();
    login.mockResolvedValue({ status: 'pending' });
    mockedUseSession.mockReturnValue({ login });

    await render(<LoginScreen />);
    await fireEvent.changeText(screen.getByTestId('login-email-input'), 'doc@example.com');
    await fireEvent.changeText(screen.getByTestId('login-password-input'), 'secret123');
    await fireEvent.press(screen.getByTestId('login-submit'));

    await waitFor(() => expect(screen.getByTestId('login-error')).toBeTruthy());
    expect(screen.getByTestId('login-error').props.children).toMatch(/ожидает одобрения/);
  });

  it('shows an "invalid credentials" message when login() resolves invalid', async () => {
    const login = makeLoginMock();
    login.mockResolvedValue({ status: 'invalid' });
    mockedUseSession.mockReturnValue({ login });

    await render(<LoginScreen />);
    await fireEvent.changeText(screen.getByTestId('login-email-input'), 'doc@example.com');
    await fireEvent.changeText(screen.getByTestId('login-password-input'), 'wrong');
    await fireEvent.press(screen.getByTestId('login-submit'));

    await waitFor(() => expect(screen.getByTestId('login-error')).toBeTruthy());
    expect(screen.getByTestId('login-error').props.children).toMatch(/Неверный/);
  });

  it('shows a retry-after message when login() resolves locked', async () => {
    const login = makeLoginMock();
    login.mockResolvedValue({ status: 'locked', retryAfterSeconds: 42 });
    mockedUseSession.mockReturnValue({ login });

    await render(<LoginScreen />);
    await fireEvent.changeText(screen.getByTestId('login-email-input'), 'doc@example.com');
    await fireEvent.changeText(screen.getByTestId('login-password-input'), 'wrong');
    await fireEvent.press(screen.getByTestId('login-submit'));

    await waitFor(() => expect(screen.getByTestId('login-error')).toBeTruthy());
    expect(screen.getByTestId('login-error').props.children).toMatch(/42/);
  });

  it('keeps the submit button disabled until both fields are filled', async () => {
    mockedUseSession.mockReturnValue({ login: jest.fn() });

    // `Pressable`'s `disabled` prop surfaces on the queried host node as
    // `accessibilityState.disabled`, not a plain `disabled` prop.
    await render(<LoginScreen />);
    expect(screen.getByTestId('login-submit').props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByTestId('login-email-input'), 'doc@example.com');
    expect(screen.getByTestId('login-submit').props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByTestId('login-password-input'), 'secret123');
    expect(screen.getByTestId('login-submit').props.accessibilityState.disabled).toBe(false);
  });
});
