import { describe, it, expect, jest } from '@jest/globals';
import { renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as authClient from '../../lib/auth-client';

/**
 * End-to-end (within Jest) navigation-gate test for SP-4b Task 3: mounts
 * the REAL `app/` route tree via `expo-router/testing-library`'s
 * `renderRouter` (the officially supported way to test expo-router
 * layouts/redirects/tab navigators — a bare `render()` of `(tabs)/_layout`
 * or `(auth)/_layout` in isolation doesn't work, since `<Tabs>`/`<Stack>`
 * need the actual file-based routing context to resolve their child
 * screens). Only `../../lib/auth-client` is mocked (T2's own concern,
 * covered by `auth-client.test.ts`).
 *
 * ONE `renderRouter` scenario per file, deliberately: `expo-router`'s
 * internal router-store is a module-level singleton that doesn't cleanly
 * reset between multiple `renderRouter()` calls within the same test FILE
 * (verified empirically — a second `renderRouter` call in the same file
 * has its `waitFor` fail near-instantly instead of actually polling,
 * even with a generous timeout). Jest gives every test FILE its own fresh
 * module registry, so one scenario per file sidesteps this cleanly instead
 * of fighting the singleton.
 *
 * `waitFor`'s default 1000ms timeout isn't enough for the multi-hop
 * redirect chain (`index` renders `<Redirect>` -> target group's `_layout`
 * re-evaluates `useSession()` -> the screen actually mounts) to settle
 * under `renderRouter`'s fake timers — empirically needs a few seconds of
 * simulated time, hence the explicit `timeout`.
 */
jest.mock('../../lib/auth-client', () => ({
  __esModule: true,
  fetchMe: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  onLogout: jest.fn(() => () => {}),
}));

const mockedFetchMe = authClient.fetchMe as jest.MockedFunction<typeof authClient.fetchMe>;

describe('root navigation gate: unauthenticated', () => {
  it(
    'routes an unauthenticated session to the login screen, not the tab bar',
    async () => {
      mockedFetchMe.mockResolvedValue(null);

      renderRouter('./app', { initialUrl: '/' });

      await waitFor(() => expect(screen.getByTestId('login-screen')).toBeTruthy(), {
        timeout: 5000,
      });
      expect(screen.getByTestId('login-email-input')).toBeTruthy();
      expect(screen.getByTestId('login-password-input')).toBeTruthy();
      expect(screen.queryByTestId('search-screen')).toBeNull();
    },
    10000,
  );
});
