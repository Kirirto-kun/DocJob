'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, Files, Loader2, Pencil, Trash2 } from 'lucide-react';

import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import CasesFilters from '@/components/admin/cases-filters';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { useToast } from '@/hooks/use-toast';
import { useUserStore } from '@/hooks/use-user-store';
import {
  deleteCase,
  getCasesPaged,
  type CasesPage,
} from '@/app/actions';
import { CASE_MODES, type CaseMode } from '@/lib/case-schema';

const PAGE_SIZE = 20;

const MODE_KEY_BY_VALUE: Record<CaseMode, string> = {
  CLINICAL_QUEST: 'modeClinical',
  SANEPID_INVESTIGATION: 'modeSanepid',
  BEST_PRACTICE: 'modeBestPractice',
  MANAGEMENT: 'modeManagement',
};

function isCaseMode(value: string | null): value is CaseMode {
  return value !== null && (CASE_MODES as readonly string[]).includes(value);
}

/**
 * Compose the displayed pagination sequence.
 * Always shows page 1, current ±1, and the last page; inserts a sentinel
 * `'…'` for gaps. The list is de-duped while preserving order.
 *
 * Example (current=7, pageCount=12) => [1, '…', 6, 7, 8, '…', 12]
 * Example (current=2, pageCount=5)  => [1, 2, 3, 4, 5]
 */
export function paginationSequence(
  current: number,
  pageCount: number,
): Array<number | '…'> {
  if (pageCount <= 1) return [1];

  const candidates = new Set<number>([1, current - 1, current, current + 1, pageCount]);
  const pages = Array.from(candidates)
    .filter((p) => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b);

  const out: Array<number | '…'> = [];
  for (let i = 0; i < pages.length; i++) {
    if (i > 0 && pages[i] - pages[i - 1] > 1) out.push('…');
    out.push(pages[i]);
  }
  return out;
}

export default function AdminCasesPage() {
  const { currentUser, isInitialized } = useUserStore();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const t = useTranslations('admin.cases');
  const tTaxonomy = useTranslations('taxonomy.subgroup');
  const locale = useLocale();

  const q = searchParams.get('q') ?? '';
  const subgroup = searchParams.get('subgroup') ?? '';
  const specialty = searchParams.get('specialty') ?? '';
  const modeParam = searchParams.get('mode');
  const mode: CaseMode | undefined = isCaseMode(modeParam) ? modeParam : undefined;
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);

  const [data, setData] = useState<CasesPage | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Role gate
  useEffect(() => {
    if (!isInitialized) return;
    if (!currentUser) {
      router.push('/login');
      return;
    }
    if (currentUser.role !== 'admin') {
      toast({
        variant: 'destructive',
        title: t('accessDeniedTitle'),
        description: t('accessDeniedDescription'),
      });
      router.push('/');
    }
  }, [currentUser, isInitialized, router, toast, t]);

  const fetchPage = useCallback(
    async (signal?: { cancelled: boolean }) => {
      setLoading(true);
      const res = await getCasesPaged({
        search: q || undefined,
        subgroup: subgroup || undefined,
        specialty: specialty || undefined,
        mode,
        page,
        pageSize: PAGE_SIZE,
      });
      if (signal?.cancelled) return;
      if (res.success) {
        setData(res.data);
      } else {
        setData(null);
        toast({
          variant: 'destructive',
          title: t('toast.errorTitle'),
          description: t('toast.loadFailed'),
        });
      }
      setLoading(false);
    },
    [q, subgroup, specialty, mode, page, t, toast],
  );

  useEffect(() => {
    if (!isInitialized || !currentUser || currentUser.role !== 'admin') return;
    const signal = { cancelled: false };
    void fetchPage(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [isInitialized, currentUser, fetchPage]);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale === 'kk' ? 'kk-KZ' : 'ru-RU', { dateStyle: 'short' }),
    [locale],
  );

  const subgroupLabel = (slug: string | null) => {
    if (!slug) return '—';
    try {
      return tTaxonomy(`${slug}.label`);
    } catch {
      return slug;
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setBusyId(id);
    const res = await deleteCase(id);
    setBusyId(null);
    if (res.success) {
      toast({
        title: t('toast.deletedTitle'),
        description: t('toast.deletedDescription', { name }),
      });
      // Re-fetch the current page to keep total / pageCount accurate.
      // If the page was the last and now empty, step back one.
      if (data && data.items.length === 1 && data.page > 1) {
        const params = new URLSearchParams(searchParams.toString());
        params.set('page', String(data.page - 1));
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      } else {
        await fetchPage();
      }
    } else {
      toast({
        variant: 'destructive',
        title: t('toast.errorTitle'),
        description: res.error ?? t('toast.deleteFailed'),
      });
    }
  };

  const goToPage = (next: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next <= 1) params.delete('page');
    else params.set('page', String(next));
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  if (!isInitialized || !currentUser || currentUser.role !== 'admin') {
    return (
      <DashboardLayout sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const sequence = data ? paginationSequence(data.page, data.pageCount) : [];
  const showPagination = data !== null && data.pageCount > 1;
  const from = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0;

  return (
    <DashboardLayout sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}>
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <Files className="h-5 w-5 text-primary" />
            <h1 className="text-2xl md:text-3xl font-bold text-primary font-headline">
              {t('title')}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </header>

        <CasesFilters />

        {loading && data === null ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : data === null || data.items.length === 0 ? (
          <Card className="bg-muted/30">
            <CardContent className="p-8 text-center text-muted-foreground">
              {q || subgroup || specialty || mode ? t('noResults') : t('empty')}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <div
              className={`grid gap-3 transition-opacity ${loading ? 'opacity-60' : 'opacity-100'}`}
              aria-busy={loading}
            >
              {data.items.map((c) => (
                <Card key={c.id} className="transition-colors hover:border-primary/40">
                  <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold">{c.name}</h3>
                        <Badge variant="secondary" className="text-[10px]">
                          {t(MODE_KEY_BY_VALUE[c.mode] ?? 'modeClinical')}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {subgroupLabel(c.subgroup)}
                        {c.specialty ? ` · ${c.specialty}` : ''}
                        {' · '}
                        {t('tableUpdatedAt')}: {dateFormatter.format(new Date(c.updatedAt))}
                      </p>
                      {c.teaser ? (
                        <p className="mt-2 line-clamp-2 text-sm text-foreground/85">{c.teaser}</p>
                      ) : null}
                    </div>

                    <div className="flex flex-shrink-0 flex-wrap gap-2">
                      {c.subgroup ? (
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/cases/${c.subgroup}/${c.id}`}>
                            <ArrowRight className="mr-1 h-4 w-4" />
                            {t('openButton')}
                          </Link>
                        </Button>
                      ) : null}
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/cases/${c.id}/edit`}>
                          <Pencil className="mr-1 h-4 w-4" />
                          {t('editButton')}
                        </Link>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busyId === c.id}
                            className="text-destructive hover:text-destructive"
                          >
                            {busyId === c.id ? (
                              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="mr-1 h-4 w-4" />
                            )}
                            {t('deleteButton')}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('deleteConfirmTitle')}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t('deleteConfirmDescription', { name: c.name })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('confirmNo')}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(c.id, c.name)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {t('confirmYes')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {t('paginationOfTotal', { from, to, total: data.total })}
              </p>
              {showPagination ? (
                <Pagination className="sm:ml-auto sm:mr-0 sm:w-auto">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        aria-label={t('paginationPrev')}
                        onClick={(e) => {
                          e.preventDefault();
                          if (data.page > 1) goToPage(data.page - 1);
                        }}
                        aria-disabled={data.page <= 1}
                        className={
                          data.page <= 1 ? 'pointer-events-none opacity-50' : undefined
                        }
                      >
                        <span>{t('paginationPrev')}</span>
                      </PaginationPrevious>
                    </PaginationItem>

                    {sequence.map((entry, idx) =>
                      entry === '…' ? (
                        <PaginationItem key={`ellipsis-${idx}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={entry}>
                          <PaginationLink
                            href="#"
                            isActive={entry === data.page}
                            onClick={(e) => {
                              e.preventDefault();
                              if (entry !== data.page) goToPage(entry);
                            }}
                          >
                            {entry}
                          </PaginationLink>
                        </PaginationItem>
                      ),
                    )}

                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        aria-label={t('paginationNext')}
                        onClick={(e) => {
                          e.preventDefault();
                          if (data.page < data.pageCount) goToPage(data.page + 1);
                        }}
                        aria-disabled={data.page >= data.pageCount}
                        className={
                          data.page >= data.pageCount
                            ? 'pointer-events-none opacity-50'
                            : undefined
                        }
                      >
                        <span>{t('paginationNext')}</span>
                      </PaginationNext>
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              ) : null}
            </div>
          </div>
        )}
      </main>
    </DashboardLayout>
  );
}
