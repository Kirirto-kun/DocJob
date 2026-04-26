'use client';

import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

import { useCallback, useMemo } from 'react';
import type { PartialBlock } from '@blocknote/core';
import { ru } from '@blocknote/core/locales';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';

import type { CaseBody } from '@/lib/case-schema';
import { cn } from '@/lib/utils';

export type CaseEditorProps = {
  initialBody?: CaseBody;
  onChange: (body: CaseBody) => void;
  className?: string;
};

async function uploadAttachment(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch('/api/attachments/upload', {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? 'Не удалось загрузить файл');
  }
  const data = (await response.json()) as { url: string };
  return data.url;
}

function toInitialContent(body?: CaseBody): PartialBlock[] | undefined {
  const blocks = body?.blocks;
  return Array.isArray(blocks) && blocks.length > 0 ? (blocks as PartialBlock[]) : undefined;
}

export function CaseEditor({ initialBody, onChange, className }: CaseEditorProps) {
  const initialContent = useMemo(() => toInitialContent(initialBody), [initialBody]);

  const editor = useCreateBlockNote({
    initialContent,
    dictionary: ru,
    uploadFile: uploadAttachment,
  });

  const handleChange = useCallback(() => {
    onChange({ blocks: editor.document });
  }, [editor, onChange]);

  return (
    <div
      className={cn(
        'rounded-md border border-border bg-background text-foreground',
        className,
      )}
    >
      <BlockNoteView editor={editor} theme="dark" onChange={handleChange} />
    </div>
  );
}

export default CaseEditor;
