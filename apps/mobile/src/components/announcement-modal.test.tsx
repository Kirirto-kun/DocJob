import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { AnnouncementModal } from './announcement-modal';
import type { SerializedAnnouncement } from '../lib/api-types';

/**
 * Isolated component test — mocks `../lib/trpc` (`announcements.active`,
 * `announcements.dismiss`, `useUtils`) only.
 */
type ActiveResult = { data: SerializedAnnouncement[] | undefined };
type DismissMutationResult = { mutateAsync: typeof mockedDismissMutateAsync; isPending: boolean };

const mockedActiveQuery = jest.fn<() => ActiveResult>();
const mockedDismissMutateAsync = jest.fn<(id: string) => Promise<{ dismissed: boolean }>>();
const mockedDismissMutation = jest.fn<() => DismissMutationResult>();
const mockedInvalidateActive = jest.fn();

jest.mock('../lib/trpc', () => ({
  __esModule: true,
  trpc: {
    useUtils: () => ({
      announcements: { active: { invalidate: (...a: unknown[]) => mockedInvalidateActive(...a) } },
    }),
    announcements: {
      active: { useQuery: () => mockedActiveQuery() },
      dismiss: {
        useMutation: () => mockedDismissMutation(),
      },
    },
  },
}));

beforeEach(() => {
  mockedActiveQuery.mockReset();
  mockedDismissMutateAsync.mockReset();
  mockedDismissMutation.mockReset();
  mockedInvalidateActive.mockReset();
  mockedDismissMutateAsync.mockResolvedValue({ dismissed: true });
  mockedDismissMutation.mockReturnValue({ mutateAsync: mockedDismissMutateAsync, isPending: false });
});

function makeAnnouncement(overrides: Partial<SerializedAnnouncement> = {}): SerializedAnnouncement {
  return {
    id: 'a1',
    title: 'Новая функция',
    body: 'Теперь доступен поиск по кейсам.',
    imageUrl: null,
    linkUrl: null,
    linkLabel: null,
    active: true,
    expiresAt: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('AnnouncementModal', () => {
  it('renders nothing when there are no active announcements', async () => {
    mockedActiveQuery.mockReturnValue({ data: [] });

    await render(<AnnouncementModal />);

    expect(screen.queryByTestId('announcement-modal')).toBeNull();
  });

  it('shows the first active announcement', async () => {
    mockedActiveQuery.mockReturnValue({ data: [makeAnnouncement({ id: 'a1', title: 'Новая функция' })] });

    await render(<AnnouncementModal />);

    await waitFor(() => expect(screen.getByTestId('announcement-modal')).toBeTruthy());
    expect(screen.getByText('Новая функция')).toBeTruthy();
  });

  it('calls announcements.dismiss with the announcement id when dismissed', async () => {
    mockedActiveQuery.mockReturnValue({ data: [makeAnnouncement({ id: 'a1' })] });

    await render(<AnnouncementModal />);

    await waitFor(() => expect(screen.getByTestId('announcement-dismiss')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('announcement-dismiss'));

    await waitFor(() => expect(mockedDismissMutateAsync).toHaveBeenCalledWith('a1'));
    expect(mockedInvalidateActive).toHaveBeenCalled();
  });

  it('does not reshow the dismissed announcement even before the query refetches', async () => {
    mockedActiveQuery.mockReturnValue({
      data: [makeAnnouncement({ id: 'a1', title: 'Первое' }), makeAnnouncement({ id: 'a2', title: 'Второе' })],
    });

    await render(<AnnouncementModal />);

    await waitFor(() => expect(screen.getByText('Первое')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('announcement-dismiss'));

    // The mocked query still returns BOTH announcements (as if the
    // invalidated refetch hasn't resolved yet) — the modal must still move
    // on to the next one via its own local dismissed-id filter, not show
    // "Первое" again.
    await waitFor(() => expect(screen.getByText('Второе')).toBeTruthy());
    expect(screen.queryByText('Первое')).toBeNull();
  });

  it('shows a link button when linkUrl is present, using linkLabel or a default', async () => {
    mockedActiveQuery.mockReturnValue({
      data: [makeAnnouncement({ linkUrl: 'https://docjob.example/promo', linkLabel: 'Узнать больше' })],
    });

    await render(<AnnouncementModal />);

    await waitFor(() => expect(screen.getByTestId('announcement-link')).toBeTruthy());
    expect(screen.getByText('Узнать больше')).toBeTruthy();
  });

  it('falls back to the default "Подробнее" link label when linkLabel is not set', async () => {
    mockedActiveQuery.mockReturnValue({
      data: [makeAnnouncement({ linkUrl: 'https://docjob.example/promo', linkLabel: null })],
    });

    await render(<AnnouncementModal />);

    await waitFor(() => expect(screen.getByTestId('announcement-link')).toBeTruthy());
    expect(screen.getByText('Подробнее')).toBeTruthy();
  });

  // --- SP-4b Task 6 folded fix (T5 Minor) ---------------------------------

  it('disables the dismiss control and does not double-fire the mutation while a dismiss is pending', async () => {
    mockedActiveQuery.mockReturnValue({ data: [makeAnnouncement({ id: 'a1' })] });
    mockedDismissMutation.mockReturnValue({ mutateAsync: mockedDismissMutateAsync, isPending: true });

    await render(<AnnouncementModal />);

    const dismissButton = await screen.findByTestId('announcement-dismiss');
    expect(dismissButton.props.accessibilityState?.disabled).toBe(true);

    await fireEvent.press(dismissButton);

    expect(mockedDismissMutateAsync).not.toHaveBeenCalled();
  });

  it('shows an inline error and still invalidates when dismiss fails, without crashing', async () => {
    mockedActiveQuery.mockReturnValue({ data: [makeAnnouncement({ id: 'a1' })] });
    mockedDismissMutateAsync.mockRejectedValue(new Error('Сеть недоступна.'));

    await render(<AnnouncementModal />);

    await waitFor(() => expect(screen.getByTestId('announcement-dismiss')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('announcement-dismiss'));

    await waitFor(() => expect(screen.getByTestId('announcement-dismiss-error')).toBeTruthy());
    expect(screen.getByText('Сеть недоступна.')).toBeTruthy();
    expect(mockedInvalidateActive).toHaveBeenCalled();
  });
});
