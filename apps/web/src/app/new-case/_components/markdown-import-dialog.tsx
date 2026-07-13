'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { handleStructureCaseFromMarkdown } from '@/app/actions';
import type { CaseMode, StructuredCaseDraft } from '@/lib/case-schema';

export type MarkdownImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: CaseMode;
  hintedSubgroup?: string;
  hintedSpecialty?: string;
  onApply: (draft: StructuredCaseDraft) => void;
};

export function MarkdownImportDialog({
  open,
  onOpenChange,
  mode,
  hintedSubgroup,
  hintedSpecialty,
  onApply,
}: MarkdownImportDialogProps) {
  const { toast } = useToast();
  const [markdown, setMarkdown] = useState('');
  const [isParsing, setIsParsing] = useState(false);

  const reset = () => {
    setMarkdown('');
    setIsParsing(false);
  };

  const handleParse = async () => {
    const trimmed = markdown.trim();
    if (trimmed.length < 20) {
      toast({
        variant: 'destructive',
        title: 'Слишком короткий markdown',
        description: 'Вставьте полный текст кейса (минимум 20 символов).',
      });
      return;
    }
    setIsParsing(true);
    try {
      const res = await handleStructureCaseFromMarkdown({
        markdown: trimmed,
        mode,
        hintedSubgroup,
        hintedSpecialty,
      });
      if (!res.success) {
        toast({ variant: 'destructive', title: 'Ошибка разбора', description: res.error });
        return;
      }
      onApply(res.data);
      onOpenChange(false);
      reset();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Не удалось разобрать markdown';
      toast({ variant: 'destructive', title: 'Ошибка', description: msg });
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Импорт кейса из markdown</DialogTitle>
          <DialogDescription>
            Вставьте полный текст кейса. ИИ извлечёт тело кейса и метаданные (название, специальность, теги).
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          rows={14}
          placeholder="# Название кейса&#10;&#10;Жалобы, анамнез, исследования…"
          disabled={isParsing}
        />
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isParsing}
          >
            Отмена
          </Button>
          <Button type="button" onClick={handleParse} disabled={isParsing}>
            {isParsing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Разобрать через AI
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default MarkdownImportDialog;
