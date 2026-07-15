'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { useUserStore } from '@/hooks/use-user-store';
import { trpc } from '@/lib/trpc/react';
import type { SerializedAnnouncement } from '@docjob/core';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function AnnouncementModal() {
  const { currentUser, isInitialized } = useUserStore();
  const t = useTranslations('announcements');
  const [index, setIndex] = useState(0);

  // `active` is a publicProcedure (core's `getActiveAnnouncements` treats a
  // null actor as "no announcements", not an error) but we still gate the
  // query on having a resolved user, same as the original effect only fired
  // once a `currentUser` existed. react-query keys this query without a
  // per-user id, so `enabled` alone (not a `loadedForUser` guard) is enough
  // to avoid refetching on every `currentUser` object-reference change
  // (e.g. after a self profile update) — the query only re-fetches on a
  // real false->true `enabled` transition (logout -> login).
  const hasUser = isInitialized && !!currentUser;
  const activeQuery = trpc.announcements.active.useQuery(undefined, { enabled: hasUser });
  const queue: SerializedAnnouncement[] = hasUser ? (activeQuery.data ?? []) : [];

  // Reset the pager whenever the identity changes (new login after a
  // logout, or switching users) so a new user starts from the first
  // announcement in their own queue.
  useEffect(() => {
    setIndex(0);
  }, [currentUser?.id]);

  const current = index < queue.length ? queue[index] : null;

  const dismissMutation = trpc.announcements.dismiss.useMutation();

  function handleDismiss() {
    if (!current) return;
    const id = current.id;
    // Advance immediately for responsiveness; persist in the background.
    setIndex((prev) => prev + 1);
    dismissMutation.mutate(id);
  }

  function handleOpenChange(next: boolean) {
    // Dialog closes via the X / overlay / escape — treat any close as dismiss.
    if (!next) handleDismiss();
  }

  if (!current) return null;

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        {current.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.imageUrl}
            alt=""
            className="max-h-56 w-full rounded-md border border-border object-cover"
          />
        ) : null}
        <DialogHeader>
          <DialogTitle>{current.title}</DialogTitle>
          <DialogDescription className="whitespace-pre-line text-foreground/90">
            {current.body}
          </DialogDescription>
        </DialogHeader>
        {current.linkUrl ? (
          <Button asChild className="w-full">
            <a href={current.linkUrl} target="_blank" rel="noopener noreferrer">
              {current.linkLabel || t('defaultLinkLabel')}
            </a>
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default AnnouncementModal;
