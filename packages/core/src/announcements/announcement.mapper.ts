import type { Announcement } from '@docjob/db';

export type SerializedAnnouncement = {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Moved verbatim from apps/web/src/app/actions.ts (SP-1b Task 7). */
export function serializeAnnouncement(item: Announcement): SerializedAnnouncement {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    imageUrl: item.imageUrl,
    linkUrl: item.linkUrl,
    linkLabel: item.linkLabel,
    active: item.active,
    expiresAt: item.expiresAt ? item.expiresAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
