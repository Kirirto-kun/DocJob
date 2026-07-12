'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Lightbulb,
  MessageSquare,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import type { SuggestedAction } from '@/lib/case-schema';

export type SuggestedActionsChipsProps = {
  actions: SuggestedAction[];
  onPick: (action: SuggestedAction) => void;
  disabled?: boolean;
  className?: string;
};

function pickIcon(label: string): LucideIcon {
  const text = label.toLowerCase();
  if (/(ошиб|неправ|плох)/.test(text)) return AlertCircle;
  if (/(прав|верн|корректн|подтверд)/.test(text)) return CheckCircle2;
  if (/(идея|подскаж|совет|рекоменд|предлож)/.test(text)) return Lightbulb;
  if (/(\?|вопрос|уточн|почему|как |зачем)/.test(text)) return HelpCircle;
  if (/(обсуд|поговор|расскаж|объясн)/.test(text)) return MessageSquare;
  return Sparkles;
}

export function SuggestedActionsChips({
  actions,
  onPick,
  disabled,
  className,
}: SuggestedActionsChipsProps) {
  if (!actions.length) return null;
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {actions.map((action, index) => {
        const Icon = pickIcon(action.label);
        return (
          <Button
            key={action.id}
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => onPick(action)}
            className={cn(
              'h-auto whitespace-normal text-left gap-2 rounded-full border border-border/60 bg-muted/30',
              'px-3 py-1.5 text-xs font-medium text-foreground/90',
              'transition-all duration-200 ease-out',
              'hover:bg-primary/10 hover:border-primary/50 hover:text-foreground hover:-translate-y-0.5',
              'disabled:opacity-50 disabled:hover:translate-y-0',
              'animate-in fade-in slide-in-from-bottom-1 fill-mode-both',
            )}
            style={{ animationDelay: `${index * 40}ms` }}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <span>{action.label}</span>
          </Button>
        );
      })}
    </div>
  );
}

export default SuggestedActionsChips;
