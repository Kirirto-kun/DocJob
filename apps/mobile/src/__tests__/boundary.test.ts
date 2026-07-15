import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Architectural guard: apps/mobile is a React Native bundle. @docjob/api's
 * entrypoint exports the `appRouter` VALUE next to the `AppRouter` TYPE, and
 * `appRouter` transitively imports @docjob/core -> prisma/argon2/openai —
 * none of which can bundle for React Native (see CLAUDE.md's "THE #1 RISK"
 * note for SP-4b). Mobile may only ever do `import type { AppRouter } from
 * '@docjob/api'` and must NEVER import @docjob/core/@docjob/db/@docjob/auth
 * at all (type or value — those packages have no meaning on-device).
 *
 * This walks every .ts/.tsx file under apps/mobile/src and apps/mobile/app
 * and fails the build if either rule is violated. Mirrors the pattern of
 * packages/api/src/boundary.test.ts. ESLint's `no-restricted-imports`
 * (eslint.config.js) catches @docjob/core|db|auth too, but can't distinguish
 * `import type` from a value import of @docjob/api — that's what test (b)
 * below is for.
 */

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      out.push(...walk(p));
    } else if (/\.(ts|tsx)$/.test(p)) {
      out.push(p);
    }
  }
  return out;
}

// Strip `/* */` block comments (including multi-line ones) and then `//`
// line comments before scanning for import specifiers, so a doc comment
// that merely *mentions* '@docjob/core' or '@docjob/api' (like the ones in
// this very file, or in src/lib/api-types.ts) can't be mistaken for a real
// import statement. Note: this is a textual grep, not a parser — it does
// NOT cover `require('@docjob/api')` or dynamic `import('@docjob/api')`
// value usage. ESLint's `no-restricted-imports` backstops @docjob/core|db|auth
// for those exotic forms too; a value `require('@docjob/api')` specifically
// is an accepted gap here.
function stripLineComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

describe('RN bundle boundary', () => {
  const files = [...walk(join(__dirname, '..')), ...walk(join(__dirname, '../../app'))];

  it('found source files to check (sanity check for the walker itself)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('never imports @docjob/core|db|auth', () => {
    const violations: string[] = [];
    for (const f of files) {
      const src = stripLineComments(readFileSync(f, 'utf8'));
      if (/from ['"]@docjob\/(core|db|auth)['"]/.test(src)) {
        violations.push(f);
      }
    }
    if (violations.length > 0) {
      throw new Error(`server-only package imported in mobile:\n${violations.join('\n')}`);
    }
    expect(violations).toEqual([]);
  });

  it('imports @docjob/api only as a type', () => {
    const violations: string[] = [];
    for (const f of files) {
      const src = stripLineComments(readFileSync(f, 'utf8'));
      const lines = src.split('\n').filter((l) => /from ['"]@docjob\/api['"]/.test(l));
      for (const l of lines) {
        if (!/^\s*import\s+type\b/.test(l)) {
          violations.push(`${f}: ${l.trim()}`);
        }
      }
    }
    if (violations.length > 0) {
      throw new Error(`non-type-only @docjob/api import found:\n${violations.join('\n')}`);
    }
    expect(violations).toEqual([]);
  });
});
