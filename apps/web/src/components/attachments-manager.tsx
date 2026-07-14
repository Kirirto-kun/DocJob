'use client';

import { useCallback, useRef, useState } from 'react';
import { File as FileIcon, FileText, Image as ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { deleteCaseAttachment, updateCaseAttachment } from '@/app/actions';
import { authFetch } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

export type ManagedAttachment = {
  id: string;
  filename: string;
  originalName: string | null;
  title: string | null;
  description: string | null;
  mimeType: string;
  size: number;
  kind: string;
  url: string;
};

export type AttachmentsManagerProps = {
  attachments: ManagedAttachment[];
  onChange: (next: ManagedAttachment[]) => void;
  className?: string;
};

const KB = 1024;
const MB = KB * 1024;

function formatSize(bytes: number): string {
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} МБ`;
  if (bytes >= KB) return `${Math.round(bytes / KB)} КБ`;
  return `${bytes} Б`;
}

function kindIcon(kind: string) {
  if (kind === 'image') return ImageIcon;
  if (kind === 'pdf') return FileText;
  return FileIcon;
}

export function AttachmentsManager({ attachments, onChange, className }: AttachmentsManagerProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      setUploading((n) => n + list.length);
      const newAttachments: ManagedAttachment[] = [];
      for (const file of list) {
        try {
          const fd = new FormData();
          fd.append('file', file);
          const res = await authFetch('/api/attachments/upload', { method: 'POST', body: fd });
          if (!res.ok) {
            const err = (await res.json().catch(() => null)) as { error?: string } | null;
            throw new Error(err?.error ?? `Не удалось загрузить ${file.name}`);
          }
          const data = (await res.json()) as ManagedAttachment;
          newAttachments.push(data);
        } catch (e) {
          toast({
            variant: 'destructive',
            title: 'Ошибка загрузки',
            description: e instanceof Error ? e.message : String(e),
          });
        } finally {
          setUploading((n) => n - 1);
        }
      }
      if (newAttachments.length) onChange([...attachments, ...newAttachments]);
    },
    [attachments, onChange, toast],
  );

  const handlePick = () => inputRef.current?.click();

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    void uploadFiles(e.target.files);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) void uploadFiles(e.dataTransfer.files);
  };

  const updateField = async (
    id: string,
    field: 'title' | 'description',
    value: string,
  ) => {
    const next = attachments.map((a) => (a.id === id ? { ...a, [field]: value || null } : a));
    onChange(next);
    const result = await updateCaseAttachment({ id, [field]: value || null });
    if (!result.success) {
      toast({
        variant: 'destructive',
        title: 'Не удалось сохранить',
        description: result.error,
      });
    }
  };

  const handleDelete = async (id: string) => {
    onChange(attachments.filter((a) => a.id !== id));
    const result = await deleteCaseAttachment(id);
    if (!result.success) {
      toast({
        variant: 'destructive',
        title: 'Не удалось удалить',
        description: result.error,
      });
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleInput}
        accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv"
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          'flex flex-col items-center justify-center rounded-md border-2 border-dashed border-border p-6 text-center transition',
          dragOver && 'border-primary bg-primary/5',
        )}
      >
        <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Перетащите файлы сюда или
        </p>
        <Button type="button" variant="secondary" className="mt-2" onClick={handlePick}>
          Выбрать файлы
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Картинки, PDF, Word, Excel, PowerPoint, txt — до 25 МБ каждый
        </p>
        {uploading > 0 ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Загружается {uploading} {uploading === 1 ? 'файл' : 'файлов'}…
          </div>
        ) : null}
      </div>

      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Файлы пока не добавлены. Студент увидит этот блок пустым.
        </p>
      ) : (
        <ul className="space-y-3">
          {attachments.map((a) => {
            const Icon = kindIcon(a.kind);
            return (
              <li key={a.id}>
                <Card className="p-3">
                  <div className="flex gap-3">
                    {a.kind === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.url}
                        alt={a.originalName ?? a.filename}
                        className="h-20 w-20 flex-shrink-0 rounded-md border border-border/60 object-cover"
                      />
                    ) : (
                      <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40">
                        <Icon className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs text-muted-foreground">
                            {a.originalName ?? a.filename} · {formatSize(a.size)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(a.id)}
                          aria-label="Удалить"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs" htmlFor={`title-${a.id}`}>
                          Название
                        </Label>
                        <Input
                          id={`title-${a.id}`}
                          value={a.title ?? ''}
                          onChange={(e) => updateField(a.id, 'title', e.target.value)}
                          placeholder={a.originalName ?? 'Название файла'}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs" htmlFor={`desc-${a.id}`}>
                          Описание (необязательно)
                        </Label>
                        <Textarea
                          id={`desc-${a.id}`}
                          value={a.description ?? ''}
                          onChange={(e) => updateField(a.id, 'description', e.target.value)}
                          placeholder="Что показывает этот файл"
                          rows={2}
                        />
                      </div>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default AttachmentsManager;
