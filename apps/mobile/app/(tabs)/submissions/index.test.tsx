import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import SubmissionsIndexScreen from './index';
import type { SerializedSubmission } from '../../../src/lib/api-types';

type MineResult = { data: SerializedSubmission[] | undefined; isLoading: boolean; isError: boolean };

const mockedMineQuery = jest.fn<() => MineResult>();
const mockedCreateMutateAsync = jest.fn<(input: unknown) => Promise<SerializedSubmission>>();
const mockedInvalidateMine = jest.fn();

jest.mock('../../../src/lib/trpc', () => ({
  __esModule: true,
  trpc: {
    useUtils: () => ({ submissions: { mine: { invalidate: (...a: unknown[]) => mockedInvalidateMine(...a) } } }),
    submissions: {
      mine: { useQuery: () => mockedMineQuery() },
      create: {
        useMutation: () => ({ mutateAsync: mockedCreateMutateAsync, isPending: false }),
      },
    },
  },
}));

const mockedPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: (...args: unknown[]) => mockedPush(...args) },
}));

beforeEach(() => {
  mockedMineQuery.mockReset();
  mockedCreateMutateAsync.mockReset();
  mockedInvalidateMine.mockReset();
  mockedPush.mockReset();
});

function baseResult(overrides: Partial<MineResult> = {}): MineResult {
  return { data: undefined, isLoading: false, isError: false, ...overrides };
}

function makeSubmission(overrides: Partial<SerializedSubmission> = {}): SerializedSubmission {
  return {
    id: 's1',
    authorUserId: 'u1',
    authorName: 'Иван Иванов',
    authorEmail: 'ivan@example.com',
    title: 'Интересный случай',
    description: 'Подробное описание случая.',
    authors: [],
    subgroup: 'clinical',
    status: 'new',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    messageCount: 1,
    messages: [],
    ...overrides,
  } as unknown as SerializedSubmission;
}

describe('SubmissionsIndexScreen', () => {
  it('shows a loading state while submissions.mine is in flight', async () => {
    mockedMineQuery.mockReturnValue(baseResult({ isLoading: true }));

    await render(<SubmissionsIndexScreen />);

    expect(screen.getByTestId('submissions-loading')).toBeTruthy();
  });

  it('shows the empty state for no submissions', async () => {
    mockedMineQuery.mockReturnValue(baseResult({ data: [] }));

    await render(<SubmissionsIndexScreen />);

    await waitFor(() => expect(screen.getByTestId('submissions-empty')).toBeTruthy());
  });

  it('renders submission rows with a status badge and navigates to the thread on tap', async () => {
    mockedMineQuery.mockReturnValue(
      baseResult({ data: [makeSubmission({ id: 's1', status: 'in_review' })] }),
    );

    await render(<SubmissionsIndexScreen />);

    await waitFor(() => expect(screen.getByTestId('submission-item-s1')).toBeTruthy());
    expect(screen.getByText('На рассмотрении')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('submission-item-s1'));

    expect(mockedPush).toHaveBeenCalledWith('/(tabs)/submissions/s1');
  });

  it('creates a submission via the inline form and invalidates the list', async () => {
    mockedMineQuery.mockReturnValue(baseResult({ data: [] }));
    mockedCreateMutateAsync.mockResolvedValue(makeSubmission());

    await render(<SubmissionsIndexScreen />);

    await fireEvent.press(screen.getByTestId('submission-toggle-form'));
    expect(screen.getByTestId('submission-create-form')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('submission-title-input'), 'Новый кейс');
    await fireEvent.changeText(
      screen.getByTestId('submission-description-input'),
      'Достаточно длинное описание кейса.',
    );
    await fireEvent.press(screen.getByTestId('submission-submit'));

    await waitFor(() =>
      expect(mockedCreateMutateAsync).toHaveBeenCalledWith({
        title: 'Новый кейс',
        description: 'Достаточно длинное описание кейса.',
        authors: [],
        subgroup: null,
      }),
    );
    expect(mockedInvalidateMine).toHaveBeenCalled();
    // Form collapses back after a successful submit.
    expect(screen.queryByTestId('submission-create-form')).toBeNull();
  });

  it('shows an error and keeps the form open when create fails', async () => {
    mockedMineQuery.mockReturnValue(baseResult({ data: [] }));
    mockedCreateMutateAsync.mockRejectedValue(new Error('Не удалось отправить.'));

    await render(<SubmissionsIndexScreen />);

    await fireEvent.press(screen.getByTestId('submission-toggle-form'));
    await fireEvent.changeText(screen.getByTestId('submission-title-input'), 'Новый кейс');
    await fireEvent.changeText(
      screen.getByTestId('submission-description-input'),
      'Достаточно длинное описание кейса.',
    );
    await fireEvent.press(screen.getByTestId('submission-submit'));

    await waitFor(() => expect(screen.getByTestId('submission-create-error')).toBeTruthy());
    expect(screen.getByTestId('submission-create-form')).toBeTruthy();
  });
});
