'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useTagStore } from '@/hooks/use-tag-store';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export type TagPickerProps = {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
};

const MAX_SUGGESTIONS = 8;

export function TagPicker({
  value,
  onChange,
  placeholder = 'Добавить тег…',
  disabled = false,
}: TagPickerProps) {
  const { tags, addTag } = useTagStore();
  const { toast } = useToast();
  const [input, setInput] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [open, setOpen] = useState(false);

  const query = input.trim();
  const lowerQuery = query.toLowerCase();
  const selectedLower = useMemo(
    () => new Set(value.map((t) => t.toLowerCase())),
    [value]
  );

  const suggestions = useMemo(() => {
    if (!query) return [];
    return tags
      .filter(
        (t) =>
          t.toLowerCase().includes(lowerQuery) &&
          !selectedLower.has(t.toLowerCase())
      )
      .slice(0, MAX_SUGGESTIONS);
  }, [tags, query, lowerQuery, selectedLower]);

  const hasExactMatch = useMemo(
    () => tags.some((t) => t.toLowerCase() === lowerQuery),
    [tags, lowerQuery]
  );

  const showNewHelper = query.length > 0 && !hasExactMatch;

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  const commitTag = async (rawLabel: string) => {
    const label = rawLabel.trim();
    if (!label) return;
    if (selectedLower.has(label.toLowerCase())) {
      setInput('');
      setFocusedIndex(0);
      return;
    }

    const existing = tags.find((t) => t.toLowerCase() === label.toLowerCase());
    if (existing) {
      onChange([...value, existing]);
      setInput('');
      setFocusedIndex(0);
      return;
    }

    try {
      await addTag(label);
      onChange([...value, label]);
      setInput('');
      setFocusedIndex(0);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Ошибка добавления тега',
      });
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && input === '' && value.length > 0) {
      e.preventDefault();
      onChange(value.slice(0, -1));
      return;
    }

    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault();
      setFocusedIndex((i) => (i + 1) % suggestions.length);
      return;
    }

    if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault();
      setFocusedIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
      return;
    }

    if (e.key === 'Enter') {
      if (!query) return;
      e.preventDefault();
      const pick =
        suggestions.length > 0 && focusedIndex < suggestions.length
          ? suggestions[focusedIndex]
          : query;
      await commitTag(pick);
      return;
    }

    if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative w-full">
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="gap-1 pr-1"
            >
              <span>{tag}</span>
              <button
                type="button"
                onClick={() => removeTag(tag)}
                disabled={disabled}
                aria-label={`Удалить тег ${tag}`}
                className={cn(
                  'inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-muted-foreground/20 focus:outline-none focus:ring-1 focus:ring-ring',
                  disabled && 'cursor-not-allowed opacity-50'
                )}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Input
        type="text"
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setFocusedIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay close so a click on a suggestion button fires before blur removes it.
          setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
      />

      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-md">
          <ul className="max-h-60 overflow-y-auto py-1 text-sm">
            {suggestions.map((s, i) => (
              <li key={s}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void commitTag(s)}
                  onMouseEnter={() => setFocusedIndex(i)}
                  className={cn(
                    'flex w-full px-3 py-1.5 text-left text-popover-foreground',
                    i === focusedIndex && 'bg-accent text-accent-foreground'
                  )}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showNewHelper && (
        <p className="mt-1 text-xs text-muted-foreground">
          Нажмите Enter, чтобы добавить новый тег
        </p>
      )}
    </div>
  );
}

export default TagPicker;
