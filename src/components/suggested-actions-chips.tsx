'use client';

import { Button } from '@/components/ui/button';
import type { SuggestedAction } from '@/lib/case-schema';

export type SuggestedActionsChipsProps = {
  actions: SuggestedAction[];
  onPick: (action: SuggestedAction) => void;
  disabled?: boolean;
};

// STUB — заменяется в Волне 2 (Unit U2) на красивые чипы с иконками.
export function SuggestedActionsChips({ actions, onPick, disabled }: SuggestedActionsChipsProps) {
  if (!actions.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <Button
          key={a.id}
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={() => onPick(a)}
        >
          {a.label}
        </Button>
      ))}
    </div>
  );
}

export default SuggestedActionsChips;
