'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { isCaseSaved, toggleSavedCase } from '@/app/actions';
import { cn } from '@/lib/utils';

type SaveCaseButtonProps = {
  caseId: string;
  variant?: 'icon' | 'full';
  className?: string;
  initialSaved?: boolean;
};

export function SaveCaseButton({
  caseId,
  variant = 'icon',
  className,
  initialSaved,
}: SaveCaseButtonProps) {
  const t = useTranslations('caseSaveButton');
  const { toast } = useToast();
  const [saved, setSaved] = useState<boolean | null>(initialSaved ?? null);
  const [pending, startTransition] = useTransition();

  // Sync from prop when parent re-renders with a freshly-loaded value
  // (e.g. catalog page initially passes `false` while it loads the
  // savedIds list, then re-renders with the real value).
  useEffect(() => {
    if (initialSaved !== undefined) {
      setSaved(initialSaved);
    }
  }, [initialSaved]);

  // No prop given → fetch fresh state from server.
  useEffect(() => {
    if (initialSaved !== undefined) return;
    let cancelled = false;
    void (async () => {
      const res = await isCaseSaved(caseId);
      if (cancelled) return;
      if (res.success) setSaved(res.data.saved);
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId, initialSaved]);

  const onClick = () => {
    startTransition(async () => {
      const res = await toggleSavedCase(caseId);
      if (!res.success) {
        toast({ variant: 'destructive', title: res.error });
        return;
      }
      setSaved(res.data.saved);
    });
  };

  const isSaved = saved === true;
  const ariaLabel = isSaved ? t('savedAria') : t('saveAria');

  if (variant === 'icon') {
    return (
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={onClick}
        disabled={pending || saved === null}
        aria-label={ariaLabel}
        title={isSaved ? t('saved') : t('save')}
        className={className}
      >
        <Star
          className={cn(
            'h-5 w-5 transition-colors',
            isSaved ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground',
          )}
        />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={isSaved ? 'secondary' : 'outline'}
      onClick={onClick}
      disabled={pending || saved === null}
      className={className}
    >
      <Star
        className={cn(
          'mr-2 h-4 w-4',
          isSaved ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground',
        )}
      />
      {isSaved ? t('saved') : t('save')}
    </Button>
  );
}
