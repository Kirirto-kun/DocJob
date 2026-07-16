import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import ru from './ru.json';
import kk from './kk.json';

/**
 * i18n key-coverage gate (SP-4b Task 6 brief): every `t('...')` call anywhere
 * in the app must resolve in BOTH catalogs, and the two catalogs must carry
 * exactly the same key set (so a translator adding a key to one and
 * forgetting the other fails CI instead of silently falling back to the
 * English-ish raw key at runtime for one locale only).
 */

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      out.push(...walk(p));
    } else if (/\.(ts|tsx)$/.test(p) && !/\.test\.(ts|tsx)$/.test(p)) {
      out.push(p);
    }
  }
  return out;
}

/** Flattens a nested translation object into dot-path keys, e.g. `{a:{b:1}} -> ['a.b']`. */
function flattenKeys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix];
  const out: string[] = [];
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      out.push(...flattenKeys(value, path));
    } else {
      out.push(path);
    }
  }
  return out;
}

function resolveKey(catalog: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<unknown>((acc, segment) => {
    if (acc === null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[segment];
  }, catalog);
}

/**
 * Collects every string literal passed as the first argument to a `t(...)`
 * call across the app's source. Matches `t('a.b')`, `t("a.b")`, and
 * `t('a.b', { ... })` (comma or closing paren after the literal) — a plain
 * textual scan (not a real parser), same tradeoff `boundary.test.ts` makes.
 */
function collectTranslationKeys(files: string[]): Set<string> {
  const keys = new Set<string>();
  const pattern = /\bt\(\s*(['"])((?:[a-zA-Z0-9_]+\.)*[a-zA-Z0-9_]+)\1\s*[,)]/g;
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(src)) !== null) {
      keys.add(match[2]);
    }
  }
  return keys;
}

describe('i18n key coverage', () => {
  const srcFiles = [...walk(join(__dirname, '..')), ...walk(join(__dirname, '../../app'))];
  const usedKeys = collectTranslationKeys(srcFiles);

  it('found t(...) usages to check (sanity check for the scanner itself)', () => {
    expect(usedKeys.size).toBeGreaterThan(0);
  });

  it('every t(...) key used in the app resolves in ru.json', () => {
    const missing = [...usedKeys].filter((key) => resolveKey(ru, key) === undefined);
    expect(missing).toEqual([]);
  });

  it('every t(...) key used in the app resolves in kk.json', () => {
    const missing = [...usedKeys].filter((key) => resolveKey(kk, key) === undefined);
    expect(missing).toEqual([]);
  });

  it('every resolved value is a non-empty string (no accidental object/array keys referenced)', () => {
    for (const key of usedKeys) {
      expect(typeof resolveKey(ru, key)).toBe('string');
      expect(typeof resolveKey(kk, key)).toBe('string');
    }
  });

  it('ru.json and kk.json carry exactly the same key set', () => {
    const ruKeys = flattenKeys(ru).sort();
    const kkKeys = flattenKeys(kk).sort();
    expect(ruKeys).toEqual(kkKeys);
  });
});
