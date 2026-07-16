import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import SubmissionDetailScreen from './[id]';
import type { SerializedSubmissionDetail, SerializedSubmissionMessage } from '../../../src/lib/api-types';

type ByIdResult = { data: SerializedSubmissionDetail | undefined; isLoading: boolean; isError: boolean };

const mockedByIdQuery = jest.fn<(input: unknown, opts: unknown) => ByIdResult>();
const mockedSendMutateAsync =
  jest.fn<(input: { submissionId: string; body: string }) => Promise<SerializedSubmissionMessage>>();

const mockedInvalidate = {
  byId: jest.fn(),
  mine: jest.fn(),
};

jest.mock('../../../src/lib/trpc', () => ({
  __esModule: true,
  trpc: {
    useUtils: () => ({
      submissions: {
        byId: { invalidate: (...a: unknown[]) => mockedInvalidate.byId(...a) },
        mine: { invalidate: (...a: unknown[]) => mockedInvalidate.mine(...a) },
      },
    }),
    submissions: {
      byId: { useQuery: (input: unknown, opts: unknown) => mockedByIdQuery(input, opts) },
      sendMessage: {
        useMutation: () => ({ mutateAsync: mockedSendMutateAsync, isPending: false }),
      },
    },
  },
}));

const mockedPush = jest.fn();
const mockedBack = jest.fn();
const mockedUseLocalSearchParams = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: {
    push: (...args: unknown[]) => mockedPush(...args),
    back: (...args: unknown[]) => mockedBack(...args),
  },
  useLocalSearchParams: () => mockedUseLocalSearchParams(),
}));

beforeEach(() => {
  mockedByIdQuery.mockReset();
  mockedSendMutateAsync.mockReset();
  mockedInvalidate.byId.mockReset();
  mockedInvalidate.mine.mockReset();
  mockedPush.mockReset();
  mockedBack.mockReset();
  mockedUseLocalSearchParams.mockReturnValue({ id: 'sub-1' });
});

function makeSubmission(overrides: Partial<SerializedSubmissionDetail> = {}): SerializedSubmissionDetail {
  return {
    id: 'sub-1',
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
    messageCount: 0,
    messages: [],
    ...overrides,
  } as unknown as SerializedSubmissionDetail;
}

function makeMessage(overrides: Partial<SerializedSubmissionMessage> = {}): SerializedSubmissionMessage {
  return {
    id: 'm1',
    submissionId: 'sub-1',
    senderId: 'u1',
    senderName: 'Иван Иванов',
    senderRole: 'DOCTOR',
    body: 'Первое сообщение.',
    attachments: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  } as unknown as SerializedSubmissionMessage;
}

describe('SubmissionDetailScreen', () => {
  it('shows a loading state while submissions.byId is in flight', async () => {
    mockedByIdQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    await render(<SubmissionDetailScreen />);

    expect(screen.getByTestId('submission-detail-loading')).toBeTruthy();
  });

  it('renders the submission title, status, and an empty thread', async () => {
    mockedByIdQuery.mockReturnValue({ data: makeSubmission(), isLoading: false, isError: false });

    await render(<SubmissionDetailScreen />);

    await waitFor(() => expect(screen.getByTestId('submission-detail-screen')).toBeTruthy());
    expect(screen.getByText('Интересный случай')).toBeTruthy();
    expect(screen.getByText('Новое')).toBeTruthy();
    expect(screen.getByTestId('submission-thread-empty')).toBeTruthy();
  });

  it('renders existing thread messages', async () => {
    mockedByIdQuery.mockReturnValue({
      data: makeSubmission({ messages: [makeMessage({ id: 'm1', body: 'Первое сообщение.' })] }),
      isLoading: false,
      isError: false,
    });

    await render(<SubmissionDetailScreen />);

    await waitFor(() => expect(screen.getByTestId('submission-message-m1')).toBeTruthy());
    expect(screen.getByText('Первое сообщение.')).toBeTruthy();
  });

  it('translates every sender role, not just ADMIN (SP-4b Task 6 folded T5 Minor fix)', async () => {
    mockedByIdQuery.mockReturnValue({
      data: makeSubmission({
        messages: [
          makeMessage({ id: 'm-admin', senderRole: 'ADMIN', body: 'От администратора.' }),
          makeMessage({ id: 'm-doctor', senderRole: 'DOCTOR', body: 'От врача.' }),
          makeMessage({ id: 'm-reviewer', senderRole: 'REVIEWER', body: 'От рецензента.' }),
        ],
      }),
      isLoading: false,
      isError: false,
    });

    await render(<SubmissionDetailScreen />);

    await waitFor(() => expect(screen.getByTestId('submission-message-m-admin')).toBeTruthy());
    expect(screen.getByText('Администратор')).toBeTruthy();
    expect(screen.getByText('Врач')).toBeTruthy();
    expect(screen.getByText('Рецензент')).toBeTruthy();
  });

  it('sends a new message and invalidates byId + mine', async () => {
    mockedByIdQuery.mockReturnValue({ data: makeSubmission(), isLoading: false, isError: false });
    mockedSendMutateAsync.mockResolvedValue(makeMessage());

    await render(<SubmissionDetailScreen />);

    await waitFor(() => expect(screen.getByTestId('submission-message-input')).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('submission-message-input'), 'Новое сообщение');
    await fireEvent.press(screen.getByTestId('submission-message-send'));

    await waitFor(() =>
      expect(mockedSendMutateAsync).toHaveBeenCalledWith({
        submissionId: 'sub-1',
        body: 'Новое сообщение',
      }),
    );
    expect(mockedInvalidate.byId).toHaveBeenCalledWith('sub-1');
    expect(mockedInvalidate.mine).toHaveBeenCalled();
  });

  it('shows an error when sending a message fails', async () => {
    mockedByIdQuery.mockReturnValue({ data: makeSubmission(), isLoading: false, isError: false });
    mockedSendMutateAsync.mockRejectedValue(new Error('Не удалось отправить сообщение.'));

    await render(<SubmissionDetailScreen />);

    await fireEvent.changeText(screen.getByTestId('submission-message-input'), 'Новое сообщение');
    await fireEvent.press(screen.getByTestId('submission-message-send'));

    await waitFor(() => expect(screen.getByTestId('submission-thread-error')).toBeTruthy());
  });

  it('shows an error state and a back link when submissions.byId fails', async () => {
    mockedByIdQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    await render(<SubmissionDetailScreen />);

    expect(screen.getByTestId('submission-detail-error')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('submission-detail-back'));
    expect(mockedBack).toHaveBeenCalled();
  });
});
