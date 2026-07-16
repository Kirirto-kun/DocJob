import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import SavedScreen from './saved';
import type { SavedCaseItem } from '../../src/lib/api-types';

/**
 * Isolated component test — same pattern as `cases/[subgroup].test.tsx`:
 * mock only the hooks this screen calls (`trpc.saved.list.useQuery`,
 * `trpc.saved.toggle.useMutation`, `trpc.useUtils`) and `expo-router`'s
 * `router.push`.
 */
type SavedListResult = { data: SavedCaseItem[] | undefined; isLoading: boolean; isError: boolean };

const mockedUseQuery = jest.fn<() => SavedListResult>();
const mockedToggleMutateAsync = jest.fn<(caseId: string) => Promise<{ saved: boolean }>>();

const mockedInvalidate = {
  list: jest.fn(),
  isSaved: jest.fn(),
  ids: jest.fn(),
};

const mockedUtils = {
  saved: {
    list: { invalidate: (...a: unknown[]) => mockedInvalidate.list(...a) },
    isSaved: { invalidate: (...a: unknown[]) => mockedInvalidate.isSaved(...a) },
    ids: { invalidate: (...a: unknown[]) => mockedInvalidate.ids(...a) },
  },
};

jest.mock('../../src/lib/trpc', () => ({
  __esModule: true,
  trpc: {
    useUtils: () => mockedUtils,
    saved: {
      list: { useQuery: () => mockedUseQuery() },
      toggle: {
        useMutation: () => ({
          mutateAsync: mockedToggleMutateAsync,
          isPending: false,
          variables: undefined,
        }),
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
  mockedUseQuery.mockReset();
  mockedToggleMutateAsync.mockReset();
  mockedInvalidate.list.mockReset();
  mockedInvalidate.isSaved.mockReset();
  mockedInvalidate.ids.mockReset();
  mockedPush.mockReset();
});

function baseResult(overrides: Partial<SavedListResult> = {}): SavedListResult {
  return { data: undefined, isLoading: false, isError: false, ...overrides };
}

function makeItem(id: string, caseId: string, name: string): SavedCaseItem {
  return {
    id,
    caseId,
    createdAt: '2024-01-01T00:00:00.000Z',
    case: {
      id: caseId,
      authorId: 'a1',
      name,
      primaryCondition: null,
      subgroup: 'clinical',
      specialty: 'Кардиология',
      tags: [],
      teaser: 'Краткое описание',
      mode: 'CLINICAL_QUEST',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  } as unknown as SavedCaseItem;
}

describe('SavedScreen', () => {
  it('shows a loading state while saved.list is in flight', async () => {
    mockedUseQuery.mockReturnValue(baseResult({ isLoading: true }));

    await render(<SavedScreen />);

    expect(screen.getByTestId('saved-loading')).toBeTruthy();
  });

  it('shows the empty state for no saved cases', async () => {
    mockedUseQuery.mockReturnValue(baseResult({ data: [] }));

    await render(<SavedScreen />);

    await waitFor(() => expect(screen.getByTestId('saved-empty')).toBeTruthy());
  });

  it('renders saved case cards and navigates to /case/<id> on tap', async () => {
    mockedUseQuery.mockReturnValue(baseResult({ data: [makeItem('sc1', 'c1', 'Кейс 1')] }));

    await render(<SavedScreen />);

    await waitFor(() => expect(screen.getByTestId('case-card-c1')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('case-card-c1'));

    expect(mockedPush).toHaveBeenCalledWith('/case/c1');
  });

  it('unsaves a case via saved.toggle and invalidates list/isSaved/ids', async () => {
    mockedUseQuery.mockReturnValue(baseResult({ data: [makeItem('sc1', 'c1', 'Кейс 1')] }));
    mockedToggleMutateAsync.mockResolvedValue({ saved: false });

    await render(<SavedScreen />);

    await waitFor(() => expect(screen.getByTestId('unsave-c1')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('unsave-c1'));

    await waitFor(() => expect(mockedToggleMutateAsync).toHaveBeenCalledWith('c1'));
    expect(mockedInvalidate.list).toHaveBeenCalled();
    expect(mockedInvalidate.isSaved).toHaveBeenCalledWith('c1');
    expect(mockedInvalidate.ids).toHaveBeenCalled();
  });

  it('shows an error banner when the unsave mutation fails', async () => {
    mockedUseQuery.mockReturnValue(baseResult({ data: [makeItem('sc1', 'c1', 'Кейс 1')] }));
    mockedToggleMutateAsync.mockRejectedValue(new Error('Сервер недоступен.'));

    await render(<SavedScreen />);

    await waitFor(() => expect(screen.getByTestId('unsave-c1')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('unsave-c1'));

    await waitFor(() => expect(screen.getByTestId('saved-error-banner')).toBeTruthy());
    expect(mockedInvalidate.list).not.toHaveBeenCalled();
  });
});
