'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRight, Loader2, Search, Sparkles } from 'lucide-react';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUserStore } from '@/hooks/use-user-store';
import { trpc } from '@/lib/trpc/react';
import type { SerializedCase } from '@docjob/core';
import { caseBodyPreview } from '@/lib/case-body-text';
import { cn } from '@/lib/utils';

export default function AiSearchPage() {
  const { currentUser, isInitialized } = useUserStore();
  const router = useRouter();
  const t = useTranslations('aiSearch');
  const tCases = useTranslations('cases');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SerializedCase[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!isInitialized) return;
    if (!currentUser) router.push('/login');
  }, [isInitialized, currentUser, router]);

  // When the user opens a case and presses Back, the browser restores this page
  // from its back-forward cache (bfcache) with the old React state — so the
  // previous query and results "stick". Reset to a clean search on bfcache
  // restore so coming back always shows a fresh, empty search.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setQuery('');
        setResults(null);
        setSearching(false);
        setPendingId(null);
      }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const onSearch = async () => {
    const text = query.trim();
    if (!text || searching) return;
    setSearching(true);
    try {
      const data = await utils.search.search.fetch({ query: text });
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleOpen = (c: SerializedCase) => {
    if (pendingId) return;
    setPendingId(c.id);
    startTransition(() => router.push(`/cases/${c.subgroup ?? ''}/${c.id}`));
  };

  return (
    <DashboardLayout sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}>
      <main className="h-full overflow-y-auto p-4 md:p-6 lg:p-8 animate-fade-in">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="font-headline text-3xl font-semibold">{t('title')}</h1>
            <p className="text-muted-foreground">{t('description')}</p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void onSearch();
            }}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('placeholder')}
                className="pl-9"
                aria-label={t('placeholder')}
              />
            </div>
            <Button type="submit" disabled={searching || query.trim().length === 0}>
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span className="ml-2">{t('searchButton')}</span>
            </Button>
          </form>

          {searching ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">{t('searching')}</p>
            </div>
          ) : results === null ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
              <Search className="h-10 w-10" />
              <p className="max-w-md text-sm">{t('description')}</p>
            </div>
          ) : results.length === 0 ? (
            <Card className="bg-muted/30">
              <CardContent className="p-8 text-center text-muted-foreground">
                {t('noResults')}
              </CardContent>
            </Card>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {t('resultsCount', { count: results.length })}
              </p>
              <div className="grid grid-cols-1 gap-4 pb-4 md:grid-cols-2 xl:grid-cols-3">
                {results.map((c) => {
                  const preview = c.teaser?.trim() || caseBodyPreview(c.body ?? null, 140);
                  const isPending = pendingId === c.id;
                  const hasOtherPending = pendingId !== null && !isPending;
                  return (
                    <Card
                      key={c.id}
                      role="button"
                      tabIndex={0}
                      aria-busy={isPending}
                      onClick={() => handleOpen(c)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleOpen(c);
                        }
                      }}
                      className={cn(
                        'group relative flex flex-col overflow-hidden border-border/60 transition-all',
                        'cursor-pointer hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        hasOtherPending && 'pointer-events-none opacity-60',
                        isPending && 'border-primary',
                      )}
                    >
                      <CardHeader className="space-y-2">
                        <CardTitle className="text-lg leading-snug text-foreground">
                          {c.name}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {c.specialty ?? tCases('noSpecialty')}
                          {c.primaryCondition ? ` · ${c.primaryCondition}` : ''}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-1 flex-col gap-3">
                        {preview ? (
                          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                            {preview}
                          </p>
                        ) : null}
                        {c.tags && c.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {c.tags.slice(0, 5).map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-[10px]">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-auto flex items-center justify-end border-t border-border/40 pt-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1 text-primary opacity-0 transition group-hover:opacity-100">
                            {tCases('openCardCta')}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </span>
                        </div>
                      </CardContent>
                      {isPending ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                      ) : null}
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </main>
    </DashboardLayout>
  );
}
