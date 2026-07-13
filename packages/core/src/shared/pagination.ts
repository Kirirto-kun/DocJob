/**
 * Cursor-based pagination helpers.
 *
 * Note: the current `getCasesPaged` in apps/web/src/app/actions.ts uses
 * offset pagination (page/pageSize/pageCount), not a cursor — there is no
 * existing cursor shape in the codebase to mirror. This implements the
 * documented fallback: a base64-encoded JSON envelope of `{ id, createdAt }`,
 * which is stable under inserts/deletes and works for any `createdAt`-ordered
 * listing. Domain services introduced in later tasks should prefer this over
 * offset pagination where practical.
 */

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export type Cursor = {
  id: string;
  createdAt: string;
};

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(value: string | null | undefined): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.id === 'string' &&
      typeof parsed.createdAt === 'string'
    ) {
      return { id: parsed.id, createdAt: parsed.createdAt };
    }
    return null;
  } catch {
    return null;
  }
}
