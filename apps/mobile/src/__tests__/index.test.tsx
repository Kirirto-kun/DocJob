import { render, screen } from '@testing-library/react-native';
import Index from '../../app/index';
import { useSession } from '../providers/session';

/**
 * `app/index.tsx` was the T1 scaffold's trivial placeholder; T3 repurposes
 * it as the "/" auth gateway (redirects into `(auth)` or `(tabs)` based on
 * `useSession().status`). `useSession` is mocked here so this stays a fast,
 * router-context-free unit test of the one branch that's safe to render in
 * isolation (the `'loading'` branch — a bare `View`/`ActivityIndicator`);
 * the `<Redirect>` branches need a real router context and are covered by
 * the `expo-router/testing-library`-based integration tests instead
 * (`src/__tests__/navigation/*.test.tsx`), which also double as this file's
 * jest-expo/RN-renderer feasibility check.
 */
jest.mock('../providers/session', () => ({
  __esModule: true,
  useSession: jest.fn(),
}));

const mockedUseSession = useSession as unknown as jest.Mock;

describe('Index (root "/" gateway)', () => {
  it('renders a loading indicator while the session is resolving', async () => {
    mockedUseSession.mockReturnValue({ status: 'loading' });

    await render(<Index />);

    expect(screen.getByTestId('root-loading')).toBeTruthy();
  });
});
