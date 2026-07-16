import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import CasesBySubgroupScreen from './[subgroup]';
import type { CaseListItem } from '../../../src/lib/api-types';

type ListPagedResult = {
  data: { items: CaseListItem[]; total: number; page: number; pageSize: number; pageCount: number } | undefined;
  isLoading: boolean;
  isError: boolean;
};

const mockedUseQuery = jest.fn<(input: unknown) => ListPagedResult>();

jest.mock('../../../src/lib/trpc', () => ({
  __esModule: true,
  trpc: {
    cases: {
      listPaged: {
        useQuery: (input: unknown) => mockedUseQuery(input),
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
  mockedUseQuery.mockReset();
  mockedPush.mockReset();
  mockedBack.mockReset();
  mockedUseLocalSearchParams.mockReturnValue({ subgroup: 'clinical' });
});

function baseResult(overrides: Partial<ListPagedResult> = {}): ListPagedResult {
  return { data: undefined, isLoading: false, isError: false, ...overrides };
}

function makeItem(id: string, name: string): CaseListItem {
  return {
    id,
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
  } as unknown as CaseListItem;
}

describe('CasesBySubgroupScreen (per-subgroup case list)', () => {
  it('shows a loading state while cases.listPaged is in flight', async () => {
    mockedUseQuery.mockReturnValue(baseResult({ isLoading: true }));

    await render(<CasesBySubgroupScreen />);

    expect(screen.getByTestId('cases-list-loading')).toBeTruthy();
  });

  it('renders the subgroup label and case cards once data resolves', async () => {
    mockedUseQuery.mockReturnValue(
      baseResult({
        data: { items: [makeItem('c1', 'Кейс 1'), makeItem('c2', 'Кейс 2')], total: 2, page: 1, pageSize: 100, pageCount: 1 },
      }),
    );

    await render(<CasesBySubgroupScreen />);

    await waitFor(() => expect(screen.getByTestId('cases-list')).toBeTruthy());
    expect(screen.getByTestId('case-card-c1')).toBeTruthy();
    expect(screen.getByTestId('case-card-c2')).toBeTruthy();
    expect(screen.getByText('Кейсы клинических инцидентов')).toBeTruthy();
  });

  it('shows an empty state for a subgroup with no cases', async () => {
    mockedUseQuery.mockReturnValue(
      baseResult({ data: { items: [], total: 0, page: 1, pageSize: 100, pageCount: 0 } }),
    );

    await render(<CasesBySubgroupScreen />);

    await waitFor(() => expect(screen.getByTestId('cases-list-empty')).toBeTruthy());
  });

  it('navigates to /case/<id> when a case card is tapped', async () => {
    mockedUseQuery.mockReturnValue(
      baseResult({ data: { items: [makeItem('c3', 'Кейс 3')], total: 1, page: 1, pageSize: 100, pageCount: 1 } }),
    );

    await render(<CasesBySubgroupScreen />);
    await waitFor(() => expect(screen.getByTestId('case-card-c3')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('case-card-c3'));

    expect(mockedPush).toHaveBeenCalledWith('/case/c3');
  });
});
