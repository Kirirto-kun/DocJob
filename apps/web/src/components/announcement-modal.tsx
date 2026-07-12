'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { useUserStore } from '@/hooks/use-user-store';
import {
  getActiveAnnouncements,
  dismissAnnouncement,
  type SerializedAnnouncement,
} from '@/app/actions';
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
  const [queue, setQueue] = useState<SerializedAnnouncement[]>([]);
  const [index, setIndex] = useState(0);
  const [loadedForUser, setLoadedForUser] = useState<string | null>(null);

  useEffect(() => {
    if (!isInitialized) return;
    if (!currentUser) {
      // Reset on logout so a new login re-fetches.
      setQueue([]);
      setIndex(0);
      setLoadedForUser(null);
      return;
    }
    if (loadedForUser === currentUser.id) return;
    setLoadedForUser(currentUser.id);
    void (async () => {
      const res = await getActiveAnnouncements();
      if (res.success) {
        setQueue(res.data);
        setIndex(0);
      }
    })();
  }, [isInitialized, currentUser, loadedForUser]);

  const current = index < queue.length ? queue[index] : null;

  function handleDismiss() {
    if (!current) return;
    const id = current.id;
    // Advance immediately for responsiveness; persist in the background.
    setIndex((prev) => prev + 1);
    void dismissAnnouncement(id);
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
