import type { NewsItem } from '@docjob/db';

export type SerializedNewsItem = {
  id: string;
  title: string;
  body: string;
  date: string;
};

/** Moved verbatim from apps/web/src/lib/news.ts + apps/web/src/app/actions.ts (SP-1b Task 7). */
export function serializeNewsItem(item: NewsItem): SerializedNewsItem {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    date: item.date.toISOString(),
  };
}
