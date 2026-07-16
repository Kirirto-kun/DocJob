import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import NewsScreen from './news';
import type { SerializedNewsItem } from '../src/lib/api-types';

type NewsListResult = { data: SerializedNewsItem[] | undefined; isLoading: boolean; isError: boolean };

const mockedUseQuery = jest.fn<() => NewsListResult>();

jest.mock('../src/lib/trpc', () => ({
  __esModule: true,
  trpc: {
    news: {
      list: { useQuery: () => mockedUseQuery() },
    },
  },
}));

const mockedBack = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { back: (...args: unknown[]) => mockedBack(...args) },
}));

beforeEach(() => {
  mockedUseQuery.mockReset();
  mockedBack.mockReset();
});

function baseResult(overrides: Partial<NewsListResult> = {}): NewsListResult {
  return { data: undefined, isLoading: false, isError: false, ...overrides };
}

function makeItem(id: string, title: string): SerializedNewsItem {
  return { id, title, body: 'Текст новости.', date: '2024-01-01T00:00:00.000Z' };
}

describe('NewsScreen', () => {
  it('shows a loading state while news.list is in flight', async () => {
    mockedUseQuery.mockReturnValue(baseResult({ isLoading: true }));

    await render(<NewsScreen />);

    expect(screen.getByTestId('news-loading')).toBeTruthy();
  });

  it('shows the empty state for no news', async () => {
    mockedUseQuery.mockReturnValue(baseResult({ data: [] }));

    await render(<NewsScreen />);

    await waitFor(() => expect(screen.getByTestId('news-empty')).toBeTruthy());
  });

  it('renders news items', async () => {
    mockedUseQuery.mockReturnValue(baseResult({ data: [makeItem('n1', 'Обновление платформы')] }));

    await render(<NewsScreen />);

    await waitFor(() => expect(screen.getByTestId('news-item-n1')).toBeTruthy());
    expect(screen.getByText('Обновление платформы')).toBeTruthy();
  });

  it('shows an error state when news.list fails', async () => {
    mockedUseQuery.mockReturnValue(baseResult({ isError: true }));

    await render(<NewsScreen />);

    await waitFor(() => expect(screen.getByTestId('news-error')).toBeTruthy());
  });

  it('navigates back when the back link is tapped', async () => {
    mockedUseQuery.mockReturnValue(baseResult({ data: [] }));

    await render(<NewsScreen />);

    await fireEvent.press(screen.getByTestId('news-back'));

    expect(mockedBack).toHaveBeenCalled();
  });
});
