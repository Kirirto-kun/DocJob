'use client';

import { useState } from 'react';
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

export type DiagnosisSubmitDialogProps = {
  trigger: React.ReactNode;
  onSubmit: (finalAnswer: string) => Promise<void> | void;
  disabled?: boolean;
  title?: string;
  description?: string;
  placeholder?: string;
};

// STUB — заменяется в Волне 2 (Unit U2) на полированный диалог с подсказками.
export function DiagnosisSubmitDialog({
  trigger,
  onSubmit,
  disabled,
  title = 'Финальный ответ',
  description = 'Сформулируйте диагноз / выводы / какие ошибки были допущены и как следовало поступить.',
  placeholder = 'Ваш итоговый ответ…',
}: DiagnosisSubmitDialogProps) {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={6}
          placeholder={placeholder}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Отмена
          </Button>
          <Button
            disabled={!value.trim() || busy || disabled}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit(value.trim());
                setOpen(false);
                setValue('');
              } finally {
                setBusy(false);
              }
            }}
          >
            Отправить ответ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DiagnosisSubmitDialog;
