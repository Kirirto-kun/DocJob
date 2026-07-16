import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react-native';
import CasesIndexScreen from './index';
import { SUBGROUPS } from '../../../src/lib/taxonomy';

/** Static screen — no trpc involved, only `expo-router`'s `router.push` needs mocking. */
const mockedPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: (...args: unknown[]) => mockedPush(...args) },
}));

beforeEach(() => {
  mockedPush.mockReset();
});

describe('CasesIndexScreen (subgroup picker)', () => {
  it('renders all 4 taxonomy subgroups', async () => {
    await render(<CasesIndexScreen />);

    expect(SUBGROUPS).toHaveLength(4);
    for (const subgroup of SUBGROUPS) {
      expect(screen.getByTestId(`subgroup-item-${subgroup.slug}`)).toBeTruthy();
      expect(screen.getByText(subgroup.label)).toBeTruthy();
    }
  });

  it('pushes /(tabs)/cases/<slug> when a subgroup is tapped', async () => {
    await render(<CasesIndexScreen />);

    await fireEvent.press(screen.getByTestId('subgroup-item-clinical'));

    expect(mockedPush).toHaveBeenCalledWith('/(tabs)/cases/clinical');
  });
});
