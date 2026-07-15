import { render, screen } from '@testing-library/react-native';
import Index from '../../app/index';

// Trivial green baseline alongside the boundary test — also doubles as the
// jest-expo feasibility check: this exercises the actual RN renderer
// (host-component tree via react-test-renderer under the hood), not just
// plain assertions.
describe('Index screen', () => {
  it('renders the placeholder heading', async () => {
    // @testing-library/react-native v14's `render` is async (it wraps the
    // initial render in `act()` internally) — must be awaited before
    // `screen` is populated, or every query throws "render function has
    // not been called".
    await render(<Index />);
    expect(screen.getByText('DocJob Mobile')).toBeTruthy();
  });
});
