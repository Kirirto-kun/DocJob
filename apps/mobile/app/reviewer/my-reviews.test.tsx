import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import MyReviewsScreen from './my-reviews';
import type { SerializedReviewWithCase } from '../../src/lib/api-types';

type MineResult = { data: SerializedReviewWithCase[] | undefined; isLoading: boolean; isError: boolean };

const mockedMineQuery = jest.fn<() => MineResult>();
const mockedDeleteMutateAsync = jest.fn<(id: string) => Promise<{ id: string }>>();
const mockedInvalidateMine = jest.fn();

jest.mock('../../src/lib/trpc', () => ({
  __esModule: true,
  trpc: {
    useUtils: () => ({ reviews: { mine: { invalidate: (...a: unknown[]) => mockedInvalidateMine(...a) } } }),
    reviews: {
      mine: { useQuery: () => mockedMineQuery() },
      delete: {
        useMutation: () => ({ mutateAsync: mockedDeleteMutateAsync, isPending: false }),
      },
    },
  },
}));

const mockedPush = jest.fn();
const mockedBack = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: {
    push: (...args: unknown[]) => mockedPush(...args),
    back: (...args: unknown[]) => mockedBack(...args),
  },
}));

beforeEach(() => {
  mockedMineQuery.mockReset();
  mockedDeleteMutateAsync.mockReset();
  mockedInvalidateMine.mockReset();
  mockedPush.mockReset();
  mockedBack.mockReset();
});

function baseResult(overrides: Partial<MineResult> = {}): MineResult {
  return { data: undefined, isLoading: false, isError: false, ...overrides };
}

function makeReview(overrides: Partial<SerializedReviewWithCase> = {}): SerializedReviewWithCase {
  return {
    id: 'r1',
    caseId: 'c1',
    reviewerId: 'me',
    reviewerName: 'Др. Рецензент',
    reviewerSpecialty: null,
    reviewerAcademicDegree: null,
    reviewerWorkplace: null,
    body: 'Отличный кейс.',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    case: { id: 'c1', name: 'Кейс 1', subgroup: 'clinical' },
    ...overrides,
  } as unknown as SerializedReviewWithCase;
}

describe('MyReviewsScreen', () => {
  it('shows the empty state when there are no reviews', async () => {
    mockedMineQuery.mockReturnValue(baseResult({ data: [] }));

    await render(<MyReviewsScreen />);

    await waitFor(() => expect(screen.getByTestId('my-reviews-empty')).toBeTruthy());
  });

  it('renders reviews with the parent case name and navigates to it on tap', async () => {
    mockedMineQuery.mockReturnValue(baseResult({ data: [makeReview()] }));

    await render(<MyReviewsScreen />);

    await waitFor(() => expect(screen.getByTestId('my-review-r1')).toBeTruthy());
    expect(screen.getByText('Кейс 1')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('my-review-case-r1'));

    expect(mockedPush).toHaveBeenCalledWith('/case/c1');
  });

  it('deletes a review and invalidates reviews.mine', async () => {
    mockedMineQuery.mockReturnValue(baseResult({ data: [makeReview()] }));
    mockedDeleteMutateAsync.mockResolvedValue({ id: 'r1' });

    await render(<MyReviewsScreen />);

    await waitFor(() => expect(screen.getByTestId('my-review-delete-r1')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('my-review-delete-r1'));

    await waitFor(() => expect(mockedDeleteMutateAsync).toHaveBeenCalledWith('r1'));
    expect(mockedInvalidateMine).toHaveBeenCalled();
  });
});
