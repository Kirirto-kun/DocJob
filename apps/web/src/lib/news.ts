import * as core from '@docjob/core';

/**
 * Delegates to `@docjob/core`'s `news.listPublicNews` (SP-1b Task 7). Kept
 * as a thin re-export so the public pages that import this directly
 * (landing, /news, sitemap.ts) — none of which go through a Server Action —
 * don't need to change.
 */
export type PublicNewsItem = core.SerializedNewsItem;

export async function getPublicNewsItems(): Promise<PublicNewsItem[]> {
  return core.news.listPublicNews();
}
