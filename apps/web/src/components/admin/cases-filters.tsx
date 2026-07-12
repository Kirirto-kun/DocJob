'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SUBGROUPS, findSubgroup } from '@/lib/case-taxonomy';
import { CASE_MODES, type CaseMode } from '@/lib/case-schema';

const ALL = '__all__';
const MODE_LABEL_KEYS: Record<CaseMode, string> = {
  CLINICAL_QUEST: 'modeClinical',
  SANEPID_INVESTIGATION: 'modeSanepid',
  BEST_PRACTICE: 'modeBestPractice',
  MANAGEMENT: 'modeManagement',
};

export default function CasesFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('admin.cases');
  const tTaxonomy = useTranslations('taxonomy.subgroup');
  const [, startTransition] = useTransition();

  const q = searchParams.get('q') ?? '';
  const subgroup = searchParams.get('subgroup') ?? '';
  const specialty = searchParams.get('specialty') ?? '';
  const mode = searchParams.get('mode') ?? '';

  const [searchValue, setSearchValue] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushedSearchRef = useRef(q);

  // Sync local input when URL search param changes externally.
  useEffect(() => {
    setSearchValue(q);
    lastPushedSearchRef.current = q;
  }, [q]);

  const buildHref = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === '') params.delete(key);
      else params.set(key, value);
    }
    // Any filter change resets to page 1.
    params.delete('page');
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const push = (next: Record<string, string | undefined>) => {
    startTransition(() => {
      router.replace(buildHref(next), { scroll: false });
    });
  };

  const onSearchChange = (value: string) => {
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value === lastPushedSearchRef.current) return;
      lastPushedSearchRef.current = value;
      push({ q: value || undefined });
    }, 250);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const subgroupLabel = (slug: string) => {
    try {
      return tTaxonomy(`${slug}.label`);
    } catch {
      return findSubgroup(slug)?.label ?? slug;
    }
  };

  const specialties = useMemo(
    () => (subgroup ? findSubgroup(subgroup)?.specialties ?? [] : []),
    [subgroup],
  );

  const hasFilters = Boolean(q || subgroup || specialty || mode);

  const onSubgroupChange = (value: string) => {
    const next = value === ALL ? '' : value;
    // Reset specialty when subgroup changes (specialties depend on subgroup).
    push({ subgroup: next || undefined, specialty: undefined });
  };

  const onSpecialtyChange = (value: string) => {
    const next = value === ALL ? '' : value;
    push({ specialty: next || undefined });
  };

  const onModeChange = (value: string) => {
    const next = value === ALL ? '' : value;
    push({ mode: next || undefined });
  };

  const onReset = () => {
    setSearchValue('');
    lastPushedSearchRef.current = '';
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  };

  return (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
      <div className="relative w-full md:max-w-xs md:flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          inputMode="search"
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3 md:w-auto md:flex-1 md:grid-cols-3">
        <Select value={subgroup || ALL} onValueChange={onSubgroupChange}>
          <SelectTrigger aria-label={t('filterSubgroup')}>
            <SelectValue placeholder={t('filterSubgroupAll')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('filterSubgroupAll')}</SelectItem>
            {SUBGROUPS.map((s) => (
              <SelectItem key={s.slug} value={s.slug}>
                {subgroupLabel(s.slug)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={specialty || ALL}
          onValueChange={onSpecialtyChange}
          disabled={!subgroup}
        >
          <SelectTrigger aria-label={t('filterSpecialty')}>
            <SelectValue placeholder={t('filterSpecialtyAll')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('filterSpecialtyAll')}</SelectItem>
            {specialties.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={mode || ALL} onValueChange={onModeChange}>
          <SelectTrigger aria-label={t('filterMode')}>
            <SelectValue placeholder={t('filterModeAll')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('filterModeAll')}</SelectItem>
            {CASE_MODES.map((m) => (
              <SelectItem key={m} value={m}>
                {t(MODE_LABEL_KEYS[m])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasFilters ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="self-start md:self-auto"
        >
          <X className="mr-1 h-4 w-4" />
          {t('resetFilters')}
        </Button>
      ) : null}
    </div>
  );
}
