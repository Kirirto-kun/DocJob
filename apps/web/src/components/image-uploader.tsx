'use client';

import * as React from 'react';
import { Upload, Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export type UploadedImage = {
  filename: string;
  mimeType: string;
  url: string;
};

export type ImageUploaderProps = {
  value: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  max?: number;
  disabled?: boolean;
  label?: string;
};

export function ImageUploader({
  value,
  onChange,
  max,
  disabled,
  label = 'Прикрепить изображения',
}: ImageUploaderProps) {
  const { toast } = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = React.useState(false);

  const limitReached = max !== undefined && value.length >= max;
  const buttonDisabled = disabled || isUploading || limitReached;

  const handleSelect = () => {
    inputRef.current?.click();
  };

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);

    const uploaded: UploadedImage[] = [];
    let unauthorized = false;
    let failed = false;

    for (const file of Array.from(files)) {
      if (max !== undefined && value.length + uploaded.length >= max) break;

      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/images/upload', {
          method: 'POST',
          body: formData,
        });

        if (res.status === 401) {
          unauthorized = true;
          break;
        }

        if (!res.ok) {
          failed = true;
          continue;
        }

        const data = (await res.json()) as UploadedImage;
        uploaded.push(data);
      } catch {
        failed = true;
      }
    }

    if (uploaded.length > 0) {
      onChange([...value, ...uploaded]);
    }

    if (unauthorized) {
      toast({
        variant: 'destructive',
        title: 'Недостаточно прав для загрузки изображений',
      });
    } else if (failed) {
      toast({
        variant: 'destructive',
        title: 'Ошибка загрузки',
      });
    } else if (uploaded.length > 0) {
      toast({ title: 'Изображение загружено' });
    }

    setIsUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleRemove = (filename: string) => {
    onChange(value.filter((img) => img.filename !== filename));
  };

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={handleFiles}
        disabled={buttonDisabled}
      />

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={handleSelect}
          disabled={buttonDisabled}
        >
          {isUploading ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Upload />
          )}
          {label}
        </Button>
        {limitReached && (
          <span className="text-sm text-muted-foreground">
            Достигнут лимит: {max}
          </span>
        )}
      </div>

      {value.length > 0 && (
        <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
          {value.map((img) => (
            <div
              key={img.filename}
              className="relative aspect-square overflow-hidden rounded-md border border-border bg-muted"
            >
              <img
                src={img.url}
                alt={img.filename}
                className="h-full w-full object-cover"
              />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute right-1 top-1 h-6 w-6"
                onClick={() => handleRemove(img.filename)}
                disabled={disabled}
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ImageUploader;
