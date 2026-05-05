'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AlertTriangle, ListChecks, Loader2, Send } from 'lucide-react';

const MIN_LENGTH = 30;

export type DiagnosisSubmitDialogProps = {
  trigger: React.ReactNode;
  onSubmit: (finalAnswer: string) => Promise<void> | void;
  disabled?: boolean;
  title?: string;
  description?: string;
  placeholder?: string;
};

export function DiagnosisSubmitDialog({
  trigger,
  onSubmit,
  disabled,
  title,
  description,
  placeholder,
}: DiagnosisSubmitDialogProps) {
  const t = useTranslations('case.diagnosis');
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const trimmed = value.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_LENGTH;
  const canSubmit = !busy && !disabled && trimmed.length >= MIN_LENGTH;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
      setOpen(false);
      setValue('');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (busy) return;
    setOpen(next);
    if (!next) setValue('');
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title ?? t('title')}</DialogTitle>
          <DialogDescription>{description ?? t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
            <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
              <ListChecks className="h-4 w-4 text-primary" />
              {t('structureTitle')}
            </div>
            <ol className="list-decimal space-y-0.5 pl-5">
              <li>{t('structureItem1')}</li>
              <li>{t('structureItem2')}</li>
              <li>{t('structureItem3')}</li>
            </ol>
          </div>

          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={7}
            placeholder={placeholder ?? t('placeholder')}
            disabled={busy}
            aria-invalid={tooShort || undefined}
            className={cn(tooShort && 'border-destructive/60 focus-visible:ring-destructive/40')}
          />

          <div className="flex items-center justify-between text-xs">
            <span
              className={cn(
                'text-muted-foreground',
                tooShort && 'text-destructive',
              )}
            >
              {trimmed.length === 0
                ? t('minLengthHint', { min: MIN_LENGTH })
                : tooShort
                  ? t('tooShort', { current: trimmed.length, min: MIN_LENGTH })
                  : t('currentLength', { current: trimmed.length })}
            </span>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{t('warning')}</p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={busy}
          >
            {t('cancel')}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit} className="gap-2">
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('submitting')}
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                {t('submit')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DiagnosisSubmitDialog;
