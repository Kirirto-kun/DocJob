'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Check, Globe, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/i18n/config';
import { cn } from '@/lib/utils';

type LanguageSwitcherProps = {
  className?: string;
  size?: 'sm' | 'md';
  variant?: 'ghost' | 'outline';
};

export function LanguageSwitcher({
  className,
  size = 'sm',
  variant = 'ghost',
}: LanguageSwitcherProps) {
  const router = useRouter();
  const currentLocale = useLocale() as Locale;
  const t = useTranslations('common.language');
  const [isPending, startTransition] = useTransition();

  const setLocale = (next: Locale) => {
    if (next === currentLocale) return;
    startTransition(async () => {
      try {
        await fetch('/api/i18n/set-locale', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ locale: next }),
        });
        router.refresh();
      } catch {
        // swallow — user can retry
      }
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size === 'md' ? 'default' : 'sm'}
          className={cn('gap-1.5', className)}
          aria-label={t('label')}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Globe className="h-4 w-4" />
          )}
          <span className="text-xs font-semibold uppercase tracking-wide">
            {LOCALE_LABELS[currentLocale].short}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {t('label')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LOCALES.map((loc) => (
          <DropdownMenuItem
            key={loc}
            onClick={() => setLocale(loc)}
            className="flex items-center justify-between gap-2"
          >
            <span>{LOCALE_LABELS[loc].native}</span>
            {currentLocale === loc ? (
              <Check className="h-4 w-4 text-primary" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default LanguageSwitcher;
