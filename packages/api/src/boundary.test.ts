import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Architectural guard: @docjob/api is transport-agnostic tRPC glue over
 * @docjob/core|auth|db|types. It must never import Next.js, next-auth,
 * React, `server-only`, or the web app's `@/*` alias, and must never call
 * Next-only request primitives (it reads tokens off a standard `Request`
 * instead — see context.ts). This test walks every non-test source file and
 * fails on any leak, so the eventual web mount (SP-1d Task 7) can't silently
 * couple this package to the Next.js transport.
 */

const SRC = dirname(fileURLToPath(import.meta.url));

// Forbidden import specifiers (matched inside a from '...' / from "...").
const FORBIDDEN_IMPORTS = [/^next$/, /^next\//, /^next-auth/, /^react$/, /^react\//, /^server-only$/, /^@\//];
// Forbidden Next-only request primitives (bare identifiers).
const FORBIDDEN_CALLS = [/\brevalidatePath\s*\(/, /\brevalidateTag\s*\(/, /\bcookies\s*\(\s*\)/, /\bheaders\s*\(\s*\)/];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

const IMPORT_FROM = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]/g;

describe('@docjob/api transport-agnostic boundary', () => {
  const files = walk(SRC);

  it('imports nothing from next / next-auth / react / server-only / @/', () => {
    const violations: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      let m: RegExpExecArray | null;
      IMPORT_FROM.lastIndex = 0;
      while ((m = IMPORT_FROM.exec(text)) !== null) {
        const spec = m[1];
        if (FORBIDDEN_IMPORTS.some((re) => re.test(spec))) {
          violations.push(`${file}: imports "${spec}"`);
        }
      }
    }
    expect(violations, `api boundary leak:\n${violations.join('\n')}`).toEqual([]);
  });

  it('calls no Next-only request primitives (revalidatePath/cookies()/headers())', () => {
    const violations: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const re of FORBIDDEN_CALLS) {
        if (re.test(text)) violations.push(`${file}: uses ${re.source}`);
      }
    }
    expect(violations, `api transport-primitive leak:\n${violations.join('\n')}`).toEqual([]);
  });
});
