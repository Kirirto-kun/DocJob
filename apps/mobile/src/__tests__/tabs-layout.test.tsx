import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import TabsLayout from '../../app/(tabs)/_layout';
import { useSession } from '../providers/session';

/**
 * Isolated component test for the SP-4b Task 3 bugfix (Fix 2): `status ===
 * 'loading'` must render the shared `LoadingView` branch, NOT the
 * `<Redirect href="/(auth)/login" />` that used to catch every non-
 * `'authenticated'` status including `'loading'` itself.
 *
 * Deliberately NOT co-located as `app/(tabs)/_layout.test.tsx` — same
 * reasoning as `app/index.tsx`'s test living in `index.test.tsx` here
 * rather than next to the route file: `expo-router`'s filesystem route
 * scanner (used by every `renderRouter`-based test under
 * `src/__tests__/navigation/`) treats ANY file matching `_layout.*` inside
 * `app/(tabs)/` as a competing layout definition for that route segment —
 * co-locating this file there broke every `renderRouter` test in the suite
 * with "conflict on the route" errors. `useSession` is mocked here so this
 * only exercises the one branch that's safe to render outside a router
 * context (`'loading'` — a bare `LoadingView`); the `<Tabs>`/`<Redirect>`
 * branches need a real router and are covered by the full-tree
 * `renderRouter` integration test in
 * `src/__tests__/navigation/deep-link-loading.test.tsx`.
 */
jest.mock('../providers/session', () => ({
  __esModule: true,
  useSession: jest.fn(),
}));

const mockedUseSession = useSession as unknown as jest.Mock;

beforeEach(() => {
  mockedUseSession.mockReset();
});

describe('(tabs)/_layout', () => {
  it('renders the loading branch (not a Redirect to login) while status is "loading"', async () => {
    mockedUseSession.mockReturnValue({ status: 'loading' });

    await render(<TabsLayout />);

    expect(screen.getByTestId('tabs-loading')).toBeTruthy();
  });
});
