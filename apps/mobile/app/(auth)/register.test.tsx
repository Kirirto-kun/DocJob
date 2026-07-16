import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import RegisterScreen from './register';

/**
 * Isolated component test — see `login.test.tsx`'s doc comment for why
 * these screens are tested standalone rather than through
 * `expo-router/testing-library`'s `renderRouter`. `../../src/lib/trpc`'s
 * `trpc` export is a big `createTRPCReact<AppRouter>()` proxy; only the one
 * hook this screen actually calls (`trpc.users.register.useMutation`) is
 * stubbed. `router.replace` (the post-success navigation) is mocked too,
 * same as `pending.test.tsx`.
 */
type RegisterInput = { name: string; email: string; password: string };
type RegisterOutput = { id: string };

const mockedMutateAsync = jest.fn() as jest.MockedFunction<
  (input: RegisterInput) => Promise<RegisterOutput>
>;
const mockedUseMutation = jest.fn(() => ({ mutateAsync: mockedMutateAsync, isPending: false }));

jest.mock('../../src/lib/trpc', () => ({
  __esModule: true,
  trpc: {
    users: {
      register: {
        useMutation: () => mockedUseMutation(),
      },
    },
  },
}));

const mockedReplace = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { replace: (...args: unknown[]) => mockedReplace(...args) },
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

beforeEach(() => {
  mockedMutateAsync.mockReset();
  mockedUseMutation.mockClear();
  mockedReplace.mockReset();
});

describe('RegisterScreen', () => {
  it('renders the name/email/password fields and submit button', async () => {
    await render(<RegisterScreen />);

    expect(screen.getByTestId('register-screen')).toBeTruthy();
    expect(screen.getByTestId('register-name-input')).toBeTruthy();
    expect(screen.getByTestId('register-email-input')).toBeTruthy();
    expect(screen.getByTestId('register-password-input')).toBeTruthy();
    expect(screen.getByTestId('register-submit')).toBeTruthy();
  });

  it('submits name/email/password via trpc.users.register and routes to /pending on success', async () => {
    mockedMutateAsync.mockResolvedValue({ id: 'new-user' });

    await render(<RegisterScreen />);
    await fireEvent.changeText(screen.getByTestId('register-name-input'), 'Иван Иванов');
    await fireEvent.changeText(screen.getByTestId('register-email-input'), 'doc@example.com');
    await fireEvent.changeText(screen.getByTestId('register-password-input'), 'secret123');
    await fireEvent.press(screen.getByTestId('register-submit'));

    await waitFor(() =>
      expect(mockedMutateAsync).toHaveBeenCalledWith({
        name: 'Иван Иванов',
        email: 'doc@example.com',
        password: 'secret123',
      }),
    );
    await waitFor(() => expect(mockedReplace).toHaveBeenCalledWith('/(auth)/pending'));
  });

  it('shows an error message and does not navigate when the mutation rejects', async () => {
    mockedMutateAsync.mockRejectedValue(new Error('Пользователь с такой почтой уже существует.'));

    await render(<RegisterScreen />);
    await fireEvent.changeText(screen.getByTestId('register-name-input'), 'Иван Иванов');
    await fireEvent.changeText(screen.getByTestId('register-email-input'), 'doc@example.com');
    await fireEvent.changeText(screen.getByTestId('register-password-input'), 'secret123');
    await fireEvent.press(screen.getByTestId('register-submit'));

    await waitFor(() => expect(screen.getByTestId('register-error')).toBeTruthy());
    expect(screen.getByTestId('register-error').props.children).toMatch(/уже существует/);
    expect(mockedReplace).not.toHaveBeenCalled();
  });
});
