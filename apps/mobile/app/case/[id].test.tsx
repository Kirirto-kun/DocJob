import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import CaseDetailScreen from './[id]';
import type { SerializedCase, SerializedReview, SerializedUser } from '../../src/lib/api-types';

/**
 * Isolated component test for the composed case-detail screen (`[id].tsx`
 * + `../../src/components/{case-body-webview,reviews-panel,save-button}.tsx`).
 * Mocks (same pattern as `app/(auth)/register.test.tsx` and
 * `src/__tests__/tabs-layout.test.tsx`):
 *  - `../../src/lib/trpc` — only the hooks these components actually call.
 *  - `../../src/providers/session` — `useSession().user.role` drives the
 *    reviewer-gated compose UI.
 *  - `expo-router` — `useLocalSearchParams`/`router.back`/`router.push`.
 *  - `react-native-webview` — replaced with a plain `View` that surfaces the
 *    `source.html` it was given via `accessibilityLabel`, so the test can
 *    assert on it without a real native WebView (unavailable in Jest) or
 *    relying on internal prop-forwarding of the real component.
 */

// ---- react-native-webview mock ---------------------------------------------
// `require` (not `import`) is required here: jest's module-factory hoisting
// (babel-plugin-jest-hoist) forbids referencing any out-of-scope variable
// inside a `jest.mock(...)` factory, including a top-level `import React`.
jest.mock('react-native-webview', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    __esModule: true,
    WebView: (props: { testID?: string; source?: { html?: string } }) =>
      React.createElement(View, {
        testID: props.testID,
        accessibilityLabel: props.source?.html,
      }),
  };
});

// ---- trpc mock --------------------------------------------------------------
type CaseByIdResult = { data: SerializedCase | undefined; isLoading: boolean; isError: boolean };
type ReviewsResult = { data: SerializedReview[] | undefined; isLoading: boolean };
type SavedResult = { data: { saved: boolean } | undefined; isLoading: boolean };

const mockedCaseByIdQuery = jest.fn<(input: unknown, opts: unknown) => CaseByIdResult>();
const mockedReviewsForCaseQuery = jest.fn<(input: unknown) => ReviewsResult>();
const mockedSavedIsSavedQuery = jest.fn<(input: unknown) => SavedResult>();

const mockedReviewCreateMutateAsync =
  jest.fn<(input: { caseId: string; body: string }) => Promise<SerializedReview>>();
const mockedReviewDeleteMutateAsync = jest.fn<(id: string) => Promise<void>>();
const mockedSavedToggleMutateAsync = jest.fn<(caseId: string) => Promise<{ saved: boolean }>>();

const mockedInvalidate = {
  reviewsForCase: jest.fn(),
  reviewsMine: jest.fn(),
  savedIsSaved: jest.fn(),
  savedList: jest.fn(),
  savedIds: jest.fn(),
};

const mockedUtils = {
  reviews: {
    forCase: { invalidate: (...a: unknown[]) => mockedInvalidate.reviewsForCase(...a) },
    mine: { invalidate: (...a: unknown[]) => mockedInvalidate.reviewsMine(...a) },
  },
  saved: {
    isSaved: { invalidate: (...a: unknown[]) => mockedInvalidate.savedIsSaved(...a) },
    list: { invalidate: (...a: unknown[]) => mockedInvalidate.savedList(...a) },
    ids: { invalidate: (...a: unknown[]) => mockedInvalidate.savedIds(...a) },
  },
};

jest.mock('../../src/lib/trpc', () => ({
  __esModule: true,
  trpc: {
    useUtils: () => mockedUtils,
    cases: {
      byId: { useQuery: (input: unknown, opts: unknown) => mockedCaseByIdQuery(input, opts) },
    },
    reviews: {
      forCase: { useQuery: (input: unknown) => mockedReviewsForCaseQuery(input) },
      create: {
        useMutation: () => ({ mutateAsync: mockedReviewCreateMutateAsync, isPending: false }),
      },
      delete: {
        useMutation: () => ({ mutateAsync: mockedReviewDeleteMutateAsync, isPending: false }),
      },
    },
    saved: {
      isSaved: { useQuery: (input: unknown) => mockedSavedIsSavedQuery(input) },
      toggle: {
        useMutation: () => ({ mutateAsync: mockedSavedToggleMutateAsync, isPending: false }),
      },
    },
  },
}));

// ---- session mock -----------------------------------------------------------
const mockedUseSession = jest.fn();
jest.mock('../../src/providers/session', () => ({
  __esModule: true,
  useSession: () => mockedUseSession(),
}));

// ---- expo-router mock --------------------------------------------------------
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
  mockedCaseByIdQuery.mockReset();
  mockedReviewsForCaseQuery.mockReset();
  mockedSavedIsSavedQuery.mockReset();
  mockedReviewCreateMutateAsync.mockReset();
  mockedReviewDeleteMutateAsync.mockReset();
  mockedSavedToggleMutateAsync.mockReset();
  mockedInvalidate.reviewsForCase.mockReset();
  mockedInvalidate.reviewsMine.mockReset();
  mockedInvalidate.savedIsSaved.mockReset();
  mockedInvalidate.savedList.mockReset();
  mockedInvalidate.savedIds.mockReset();
  mockedUseSession.mockReset();
  mockedPush.mockReset();
  mockedBack.mockReset();
  mockedUseLocalSearchParams.mockReturnValue({ id: 'case-1' });

  mockedSavedToggleMutateAsync.mockResolvedValue({ saved: true });
});

function makeCase(overrides: Partial<SerializedCase> = {}): SerializedCase {
  return {
    id: 'case-1',
    authorId: 'admin-1',
    name: 'Тестовый кейс',
    age: 45,
    gender: 'М',
    specialty: 'Кардиология',
    subgroup: 'clinical',
    tags: [],
    teaser: null,
    bodyHtml: '<p>Тестовое содержимое кейса</p>',
    ...overrides,
  } as unknown as SerializedCase;
}

function makeReview(overrides: Partial<SerializedReview> = {}): SerializedReview {
  return {
    id: 'r1',
    caseId: 'case-1',
    reviewerId: 'reviewer-1',
    reviewerName: 'Др. Рецензент',
    reviewerSpecialty: null,
    reviewerAcademicDegree: null,
    reviewerWorkplace: null,
    body: 'Отличный кейс для разбора.',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  } as unknown as SerializedReview;
}

function makeUser(role: 'ADMIN' | 'DOCTOR' | 'REVIEWER', id = 'me'): SerializedUser {
  return { id, role, approvedAt: '2024-01-01T00:00:00.000Z' } as unknown as SerializedUser;
}

describe('CaseDetailScreen', () => {
  it('shows a loading state while cases.byId is in flight', async () => {
    mockedCaseByIdQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    mockedReviewsForCaseQuery.mockReturnValue({ data: [], isLoading: false });
    mockedSavedIsSavedQuery.mockReturnValue({ data: { saved: false }, isLoading: false });
    mockedUseSession.mockReturnValue({ user: makeUser('DOCTOR') });

    await render(<CaseDetailScreen />);

    expect(screen.getByTestId('case-detail-loading')).toBeTruthy();
  });

  it('renders the webview with the case bodyHtml', async () => {
    mockedCaseByIdQuery.mockReturnValue({
      data: makeCase({ bodyHtml: '<p>Уникальный маркер тела кейса</p>' }),
      isLoading: false,
      isError: false,
    });
    mockedReviewsForCaseQuery.mockReturnValue({ data: [], isLoading: false });
    mockedSavedIsSavedQuery.mockReturnValue({ data: { saved: false }, isLoading: false });
    mockedUseSession.mockReturnValue({ user: makeUser('DOCTOR') });

    await render(<CaseDetailScreen />);

    await waitFor(() => expect(screen.getByTestId('case-detail-screen')).toBeTruthy());
    const webview = screen.getByTestId('case-body-webview');
    expect(webview.props.accessibilityLabel).toContain('<p>Уникальный маркер тела кейса</p>');
  });

  it('shows the review-compose UI for a REVIEWER', async () => {
    mockedCaseByIdQuery.mockReturnValue({ data: makeCase(), isLoading: false, isError: false });
    mockedReviewsForCaseQuery.mockReturnValue({ data: [], isLoading: false });
    mockedSavedIsSavedQuery.mockReturnValue({ data: { saved: false }, isLoading: false });
    mockedUseSession.mockReturnValue({ user: makeUser('REVIEWER') });

    await render(<CaseDetailScreen />);

    await waitFor(() => expect(screen.getByTestId('reviews-panel')).toBeTruthy());
    expect(screen.getByTestId('reviews-compose')).toBeTruthy();
  });

  it('does NOT show the review-compose UI for a DOCTOR (read-only)', async () => {
    mockedCaseByIdQuery.mockReturnValue({ data: makeCase(), isLoading: false, isError: false });
    mockedReviewsForCaseQuery.mockReturnValue({ data: [], isLoading: false });
    mockedSavedIsSavedQuery.mockReturnValue({ data: { saved: false }, isLoading: false });
    mockedUseSession.mockReturnValue({ user: makeUser('DOCTOR') });

    await render(<CaseDetailScreen />);

    await waitFor(() => expect(screen.getByTestId('reviews-panel')).toBeTruthy());
    expect(screen.queryByTestId('reviews-compose')).toBeNull();
  });

  it('also shows the review-compose UI for an ADMIN', async () => {
    mockedCaseByIdQuery.mockReturnValue({ data: makeCase(), isLoading: false, isError: false });
    mockedReviewsForCaseQuery.mockReturnValue({ data: [], isLoading: false });
    mockedSavedIsSavedQuery.mockReturnValue({ data: { saved: false }, isLoading: false });
    mockedUseSession.mockReturnValue({ user: makeUser('ADMIN') });

    await render(<CaseDetailScreen />);

    await waitFor(() => expect(screen.getByTestId('reviews-compose')).toBeTruthy());
  });

  it('renders existing reviews and lets the author delete their own review', async () => {
    mockedCaseByIdQuery.mockReturnValue({ data: makeCase(), isLoading: false, isError: false });
    mockedReviewsForCaseQuery.mockReturnValue({
      data: [makeReview({ id: 'r1', reviewerId: 'me' })],
      isLoading: false,
    });
    mockedSavedIsSavedQuery.mockReturnValue({ data: { saved: false }, isLoading: false });
    mockedUseSession.mockReturnValue({ user: makeUser('REVIEWER', 'me') });
    mockedReviewDeleteMutateAsync.mockResolvedValue(undefined);

    await render(<CaseDetailScreen />);

    await waitFor(() => expect(screen.getByTestId('review-item-r1')).toBeTruthy());
    expect(screen.getByTestId('review-delete-r1')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('review-delete-r1'));

    await waitFor(() => expect(mockedReviewDeleteMutateAsync).toHaveBeenCalledWith('r1'));
    expect(mockedInvalidate.reviewsForCase).toHaveBeenCalledWith('case-1');
  });

  it('calls saved.toggle and invalidates isSaved + the saved list when the save button is pressed', async () => {
    mockedCaseByIdQuery.mockReturnValue({ data: makeCase(), isLoading: false, isError: false });
    mockedReviewsForCaseQuery.mockReturnValue({ data: [], isLoading: false });
    mockedSavedIsSavedQuery.mockReturnValue({ data: { saved: false }, isLoading: false });
    mockedUseSession.mockReturnValue({ user: makeUser('DOCTOR') });

    await render(<CaseDetailScreen />);

    await waitFor(() => expect(screen.getByTestId('save-button')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('save-button'));

    await waitFor(() => expect(mockedSavedToggleMutateAsync).toHaveBeenCalledWith('case-1'));
    expect(mockedInvalidate.savedIsSaved).toHaveBeenCalledWith('case-1');
    expect(mockedInvalidate.savedList).toHaveBeenCalled();
    expect(mockedInvalidate.savedIds).toHaveBeenCalled();
  });
});
