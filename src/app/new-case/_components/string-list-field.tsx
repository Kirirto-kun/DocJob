'use client';

import { Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type StringListFieldProps = {
  label?: string;
  items: string[];
  placeholder?: string | ((index: number) => string);
  addLabel: string;
  onChange: (items: string[]) => void;
};

export function StringListField({
  label,
  items,
  placeholder,
  addLabel,
  onChange,
}: StringListFieldProps) {
  const updateAt = (index: number, val: string) => {
    const next = items.slice();
    next[index] = val;
    onChange(next);
  };
  const removeAt = (index: number) => onChange(items.filter((_, i) => i !== index));
  const append = () => onChange([...items, '']);
  const placeholderFor = (i: number) =>
    typeof placeholder === 'function' ? placeholder(i) : placeholder;

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={item}
              placeholder={placeholderFor(i)}
              onChange={(e) => updateAt(i, e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeAt(i)}
              aria-label="Удалить"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={append}>
        <Plus className="mr-2 h-4 w-4" />
        {addLabel}
      </Button>
    </div>
  );
}

export default StringListField;
