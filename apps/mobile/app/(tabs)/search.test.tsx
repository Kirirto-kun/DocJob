import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import SearchScreen from './search';
import type { SearchHit } from '../../src/lib/api-types';

/**
 * Isolated component test — same pattern as `app/(auth)/register.test.tsx`:
 * mock only the one hook this screen calls (`trpc.search.search.useQuery`)
 * rather than exercising a real tRPC round-trip, and mock `expo-router`'s
 * `router.push` to assert navigation without a real router context.
 */
type QueryResult = {
  data: SearchHit[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: { data?: { code?: string }; message?: string } | null;
};

const mockedUseQuery = jest.fn<(input: unknown, opts: unknown) => QueryResult>();

jest.mock('../../src/lib/trpc', () => ({
  __esModule: true,
  trpc: {
    search: {
      search: {
        useQuery: (input: unknown, opts: unknown) => mockedUseQuery(input, opts),
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
  mockedPush.mockReset();
});

function baseResult(overrides: Partial<QueryResult> = {}): QueryResult {
  return { data: undefined, isLoading: false, isError: false, error: null, ...overrides };
}

function makeHit(overrides: {
  id: string;
  name: string;
  specialty?: string | null;
  teaser?: string | null;
  matchedVia?: ('semantic' | 'lexical')[];
  snippet?: string | null;
}): SearchHit {
  return {
    case: {
      id: overrides.id,
      name: overrides.name,
      specialty: overrides.specialty ?? null,
      primaryCondition: null,
      teaser: overrides.teaser ?? null,
    },
    score: 1,
    matchedVia: overrides.matchedVia ?? [],
    snippet: overrides.snippet ?? null,
  } as unknown as SearchHit;
}

async function submit(query: string) {
  await fireEvent.changeText(screen.getByTestId('search-input'), query);
  await fireEvent.press(screen.getByTestId('search-submit'));
}

describe('SearchScreen', () => {
  it('shows the initial state before any query is submitted (query disabled)', async () => {
    mockedUseQuery.mockReturnValue(baseResult());

    await render(<SearchScreen />);

    expect(screen.getByTestId('search-initial')).toBeTruthy();
    expect(screen.queryByTestId('search-results-list')).toBeNull();
  });

  it('shows a loading state while the submitted query is in flight', async () => {
    mockedUseQuery.mockReturnValue(baseResult({ isLoading: true }));

    await render(<SearchScreen />);
    await submit('боль в груди');

    expect(screen.getByTestId('search-loading')).toBeTruthy();
  });

  it('renders hits with "why matched" badges and a plain-text snippet (no <mark> tags)', async () => {
    const hit = makeHit({
      id: 'c1',
      name: 'Кейс с болью в груди',
      specialty: 'Кардиология',
      matchedVia: ['semantic', 'lexical'],
      snippet: '<mark>боль</mark> в груди',
    });
    mockedUseQuery.mockReturnValue(baseResult({ data: [hit] }));

    await render(<SearchScreen />);
    await submit('боль в груди');

    await waitFor(() => expect(screen.getByTestId('search-results-list')).toBeTruthy());
    expect(screen.getByTestId('search-result-card-c1')).toBeTruthy();
    expect(screen.getByTestId('badge-semantic')).toBeTruthy();
    expect(screen.getByTestId('badge-lexical')).toBeTruthy();
    const snippetNode = screen.getByTestId('search-result-snippet');
    expect(snippetNode.props.children).toBe('боль в груди');
    expect(String(snippetNode.props.children)).not.toMatch(/<mark>/);
  });

  it('shows the zero-result state for an empty result set', async () => {
    mockedUseQuery.mockReturnValue(baseResult({ data: [] }));

    await render(<SearchScreen />);
    await submit('что-то очень редкое');

    await waitFor(() => expect(screen.getByTestId('search-empty')).toBeTruthy());
  });

  it('shows a Russian backoff message on a TOO_MANY_REQUESTS error, not the generic error state', async () => {
    mockedUseQuery.mockReturnValue(
      baseResult({
        isError: true,
        error: {
          data: { code: 'TOO_MANY_REQUESTS' },
          message: 'Слишком много запросов. Повторите через 12 с.',
        },
      }),
    );

    await render(<SearchScreen />);
    await submit('запрос');

    await waitFor(() => expect(screen.getByTestId('search-rate-limited')).toBeTruthy());
    expect(screen.queryByTestId('search-error')).toBeNull();
    expect(screen.getByText(/Повторите через 12 с/)).toBeTruthy();
  });

  it('navigates to /case/<id> when a result card is tapped', async () => {
    const hit = makeHit({ id: 'c2', name: 'Кейс 2', teaser: 'Краткое описание' });
    mockedUseQuery.mockReturnValue(baseResult({ data: [hit] }));

    await render(<SearchScreen />);
    await submit('запрос');

    await waitFor(() => expect(screen.getByTestId('search-result-card-c2')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('search-result-card-c2'));

    expect(mockedPush).toHaveBeenCalledWith('/case/c2');
  });
});
