import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import ProfileScreen from './profile';
import type { SerializedUser } from '../../src/lib/api-types';

/**
 * Isolated component test — mocks `../../src/lib/trpc` (users.me,
 * users.updateProfile, contact.send — the ContactForm this screen embeds),
 * `../../src/providers/session` (for `logout`), and `expo-router`
 * (`router.push`/`router.replace`).
 */
type MeResult = { data: SerializedUser | null | undefined; isLoading: boolean };

const mockedMeQuery = jest.fn<() => MeResult>();
const mockedUpdateMutateAsync = jest.fn<(input: unknown) => Promise<{ id: string }>>();
const mockedContactSendMutateAsync = jest.fn<(input: unknown) => Promise<{ sent: true }>>();
const mockedInvalidateMe = jest.fn();

jest.mock('../../src/lib/trpc', () => ({
  __esModule: true,
  trpc: {
    useUtils: () => ({ users: { me: { invalidate: (...a: unknown[]) => mockedInvalidateMe(...a) } } }),
    users: {
      me: { useQuery: () => mockedMeQuery() },
      updateProfile: {
        useMutation: () => ({ mutateAsync: mockedUpdateMutateAsync, isPending: false }),
      },
    },
    contact: {
      send: {
        useMutation: () => ({ mutateAsync: mockedContactSendMutateAsync, isPending: false }),
      },
    },
  },
}));

const mockedLogout = jest.fn<() => Promise<void>>();
jest.mock('../../src/providers/session', () => ({
  __esModule: true,
  useSession: () => ({ logout: mockedLogout }),
}));

const mockedPush = jest.fn();
const mockedReplace = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: {
    push: (...args: unknown[]) => mockedPush(...args),
    replace: (...args: unknown[]) => mockedReplace(...args),
  },
}));

beforeEach(() => {
  mockedMeQuery.mockReset();
  mockedUpdateMutateAsync.mockReset();
  mockedContactSendMutateAsync.mockReset();
  mockedInvalidateMe.mockReset();
  mockedLogout.mockReset();
  mockedPush.mockReset();
  mockedReplace.mockReset();
  mockedLogout.mockResolvedValue(undefined);
});

function makeUser(overrides: Partial<SerializedUser> = {}): SerializedUser {
  return {
    id: 'u1',
    email: 'doctor@example.com',
    role: 'DOCTOR',
    name: 'Иван Иванов',
    fullName: null,
    region: null,
    age: null,
    specialty: null,
    phoneNumber: null,
    workplace: null,
    academicDegree: null,
    profilePhotoUrl: null,
    consentAcceptedAt: null,
    approvedAt: '2024-01-01T00:00:00.000Z',
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  } as unknown as SerializedUser;
}

describe('ProfileScreen', () => {
  it('shows a loading indicator while users.me is in flight', async () => {
    mockedMeQuery.mockReturnValue({ data: undefined, isLoading: true });

    await render(<ProfileScreen />);

    expect(screen.getByTestId('profile-loading')).toBeTruthy();
  });

  it('renders the user name/email once loaded', async () => {
    mockedMeQuery.mockReturnValue({ data: makeUser(), isLoading: false });

    await render(<ProfileScreen />);

    await waitFor(() => expect(screen.getByTestId('profile-card')).toBeTruthy());
    expect(screen.getByText('Иван Иванов')).toBeTruthy();
    expect(screen.getByText('doctor@example.com')).toBeTruthy();
  });

  it('edits name + photo URL via users.updateProfile and invalidates users.me', async () => {
    mockedMeQuery.mockReturnValue({ data: makeUser(), isLoading: false });
    mockedUpdateMutateAsync.mockResolvedValue({ id: 'u1' });

    await render(<ProfileScreen />);

    await waitFor(() => expect(screen.getByTestId('profile-edit-start')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('profile-edit-start'));

    expect(screen.getByTestId('profile-edit-form')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('profile-name-input'), 'Пётр Петров');
    await fireEvent.changeText(screen.getByTestId('profile-photo-input'), 'https://example.com/photo.png');
    await fireEvent.press(screen.getByTestId('profile-save'));

    await waitFor(() =>
      expect(mockedUpdateMutateAsync).toHaveBeenCalledWith({
        id: 'u1',
        name: 'Пётр Петров',
        profilePhotoUrl: 'https://example.com/photo.png',
      }),
    );
    expect(mockedInvalidateMe).toHaveBeenCalled();
    // Edit form closes back to the read-only view after a successful save.
    expect(screen.queryByTestId('profile-edit-form')).toBeNull();
  });

  it('shows an error and stays in edit mode when updateProfile fails', async () => {
    mockedMeQuery.mockReturnValue({ data: makeUser(), isLoading: false });
    mockedUpdateMutateAsync.mockRejectedValue(new Error('Не удалось сохранить.'));

    await render(<ProfileScreen />);

    await fireEvent.press(screen.getByTestId('profile-edit-start'));
    await fireEvent.press(screen.getByTestId('profile-save'));

    await waitFor(() => expect(screen.getByTestId('profile-edit-error')).toBeTruthy());
    expect(screen.getByTestId('profile-edit-form')).toBeTruthy();
  });

  it('logs out and replaces the route with /(auth)/login', async () => {
    mockedMeQuery.mockReturnValue({ data: makeUser(), isLoading: false });

    await render(<ProfileScreen />);

    await fireEvent.press(screen.getByTestId('profile-logout'));

    await waitFor(() => expect(mockedLogout).toHaveBeenCalled());
    expect(mockedReplace).toHaveBeenCalledWith('/(auth)/login');
  });

  it('navigates to /news when the News link is tapped', async () => {
    mockedMeQuery.mockReturnValue({ data: makeUser(), isLoading: false });

    await render(<ProfileScreen />);

    await fireEvent.press(screen.getByTestId('profile-news-link'));

    expect(mockedPush).toHaveBeenCalledWith('/news');
  });

  it('shows the "Мои рецензии" link for a REVIEWER and navigates to it', async () => {
    mockedMeQuery.mockReturnValue({ data: makeUser({ role: 'REVIEWER' }), isLoading: false });

    await render(<ProfileScreen />);

    await waitFor(() => expect(screen.getByTestId('profile-my-reviews-link')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('profile-my-reviews-link'));

    expect(mockedPush).toHaveBeenCalledWith('/reviewer/my-reviews');
  });

  it('also shows the "Мои рецензии" link for an ADMIN', async () => {
    mockedMeQuery.mockReturnValue({ data: makeUser({ role: 'ADMIN' }), isLoading: false });

    await render(<ProfileScreen />);

    await waitFor(() => expect(screen.getByTestId('profile-my-reviews-link')).toBeTruthy());
  });

  it('does NOT show the "Мои рецензии" link for a DOCTOR', async () => {
    mockedMeQuery.mockReturnValue({ data: makeUser({ role: 'DOCTOR' }), isLoading: false });

    await render(<ProfileScreen />);

    await waitFor(() => expect(screen.getByTestId('profile-card')).toBeTruthy());
    expect(screen.queryByTestId('profile-my-reviews-link')).toBeNull();
  });

  it('renders the language toggle stub', async () => {
    mockedMeQuery.mockReturnValue({ data: makeUser(), isLoading: false });

    await render(<ProfileScreen />);

    await waitFor(() => expect(screen.getByTestId('language-toggle')).toBeTruthy());
    expect(screen.getByTestId('language-ru')).toBeTruthy();
    expect(screen.getByTestId('language-kk')).toBeTruthy();
  });

  it('submits the embedded contact form via trpc.contact.send', async () => {
    mockedMeQuery.mockReturnValue({ data: makeUser(), isLoading: false });
    mockedContactSendMutateAsync.mockResolvedValue({ sent: true });

    await render(<ProfileScreen />);

    await fireEvent.changeText(screen.getByTestId('contact-name-input'), 'Иван Иванов');
    await fireEvent.changeText(screen.getByTestId('contact-email-input'), 'ivan@example.com');
    await fireEvent.changeText(screen.getByTestId('contact-message-input'), 'Здравствуйте!');
    await fireEvent.press(screen.getByTestId('contact-submit'));

    await waitFor(() =>
      expect(mockedContactSendMutateAsync).toHaveBeenCalledWith({
        name: 'Иван Иванов',
        email: 'ivan@example.com',
        message: 'Здравствуйте!',
        company: '',
      }),
    );
    expect(screen.getByTestId('contact-form-success')).toBeTruthy();
  });
});
