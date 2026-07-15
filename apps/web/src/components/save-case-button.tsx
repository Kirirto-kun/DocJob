'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { trpc } from '@/lib/trpc/react';
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
  const utils = trpc.useUtils();
  const [saved, setSaved] = useState<boolean | null>(initialSaved ?? null);

  // Sync from prop when parent re-renders with a freshly-loaded value
  // (e.g. catalog page initially passes `false` while it loads the
  // savedIds list, then re-renders with the real value).
  useEffect(() => {
    if (initialSaved !== undefined) {
      setSaved(initialSaved);
    }
  }, [initialSaved]);

  // No prop given → fetch fresh state from server.
  const isSavedQuery = trpc.saved.isSaved.useQuery(caseId, {
    enabled: initialSaved === undefined,
  });
  useEffect(() => {
    if (initialSaved !== undefined) return;
    if (isSavedQuery.data) setSaved(isSavedQuery.data.saved);
  }, [initialSaved, isSavedQuery.data]);

  const toggleMutation = trpc.saved.toggle.useMutation();
  const pending = toggleMutation.isPending;

  const onClick = async () => {
    try {
      const res = await toggleMutation.mutateAsync(caseId);
      setSaved(res.saved);
    } catch (e) {
      toast({ variant: 'destructive', title: e instanceof Error ? e.message : t('save') });
      return;
    }
    await Promise.all([
      utils.saved.list.invalidate(),
      utils.saved.ids.invalidate(),
      utils.saved.isSaved.invalidate(caseId),
    ]);
  };

  const isSaved = saved === true;
  const ariaLabel = isSaved ? t('savedAria') : t('saveAria');

  if (variant === 'icon') {
    return (
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={() => void onClick()}
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
      onClick={() => void onClick()}
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
