import path from 'node:path';
import { describe, expect, it } from '@jest/globals';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createRouteTestPattern } = require('../../metro-route-blocklist.js') as {
  createRouteTestPattern: (projectRoot: string) => RegExp;
};

describe('Metro route exclusions', () => {
  it('keeps route tests out of production bundles without hiding real routes', () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const appRoot = path.join(projectRoot, 'app');
    const routeTestPattern = createRouteTestPattern(projectRoot);

    expect(routeTestPattern.test(path.join(appRoot, '(tabs)', 'cases', '[subgroup].test.tsx'))).toBe(
      true,
    );
    expect(routeTestPattern.test(path.join(appRoot, 'news.spec.ts'))).toBe(true);
    expect(routeTestPattern.test(path.join(appRoot, '(tabs)', 'cases', '[subgroup].tsx'))).toBe(
      false,
    );
  });
});
