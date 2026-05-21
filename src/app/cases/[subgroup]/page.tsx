'use client';

import { use, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRight, Loader2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePatientStore } from '@/hooks/use-patient-store';
import { findSubgroup } from '@/lib/case-taxonomy';
import { caseBodyPreview } from '@/lib/case-body-text';
import { cn } from '@/lib/utils';
import { SaveCaseButton } from '@/components/save-case-button';
import { getSavedCaseIds } from '@/app/actions';

const ALL_SPECIALTIES = '__all__';

export default function CasesBySubgroupPage({
  params,
}: {
  params: Promise<{ subgroup: string }>;
}) {
  const { subgroup: subgroupSlug } = use(params);
  const router = useRouter();
  const t = useTranslations('cases');
  const tTaxonomy = useTranslations('taxonomy.subgroup');
  const { patients, isInitialized, refreshPatients } = usePatientStore();
  const [specialtyFilter, setSpecialtyFilter] = useState<string>(ALL_SPECIALTIES);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  // The patient store loads once on app start. If the admin creates a new
  // case via /new-case the store stays stale, so the new card doesn't show
  // up here until full reload. Force a fresh fetch every time this page
  // mounts to keep the catalogue in sync.
  useEffect(() => {
    if (isInitialized) {
      void refreshPatients();
    }
  }, [isInitialized, refreshPatients]);

  useEffect(() => {
    if (!isInitialized) return;
    void (async () => {
      const res = await getSavedCaseIds();
      if (res.success) setSavedIds(new Set(res.data));
    })();
  }, [isInitialized]);

  const subgroup = findSubgroup(subgroupSlug);

  const casesInSubgroup = useMemo(
    () => patients.filter((p) => p.subgroup === subgroupSlug),
    [patients, subgroupSlug],
  );

  const availableSpecialties = useMemo(() => {
    const set = new Set<string>();
    casesInSubgroup.forEach((c) => {
      if (c.specialty) set.add(c.specialty);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [casesInSubgroup]);

  const visibleCases = useMemo(() => {
    if (specialtyFilter === ALL_SPECIALTIES) return casesInSubgroup;
    return casesInSubgroup.filter((c) => c.specialty === specialtyFilter);
  }, [casesInSubgroup, specialtyFilter]);

  const sidebar = <ScenarioControls onScenarioGenerated={() => {}} />;

  if (!isInitialized) {
    return (
      <DashboardLayout sidebarContent={sidebar}>
        <main className="flex h-full items-center justify-center p-4 md:p-6">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </main>
      </DashboardLayout>
    );
  }

  if (!subgroup) {
    return (
      <DashboardLayout sidebarContent={sidebar}>
        <main className="flex h-full items-center justify-center p-4 md:p-6">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle>{t('subgroupNotFoundTitle')}</CardTitle>
              <CardDescription>{t('subgroupNotFoundDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => router.push('/select-subgroup')}>
                {t('backToSelection')}
              </Button>
            </CardContent>
          </Card>
        </main>
      </DashboardLayout>
    );
  }

  const handleOpen = (caseId: string) => {
    if (pendingId) return;
    setPendingId(caseId);
    startTransition(() => router.push(`/cases/${subgroupSlug}/${caseId}`));
  };

  return (
    <DashboardLayout sidebarContent={sidebar}>
      <main className="h-full overflow-y-auto p-4 md:p-6 lg:p-8 animate-fade-in">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('subgroupLabel')}</p>
            <h1 className="text-2xl md:text-3xl font-headline font-semibold text-foreground/90">
              {tTaxonomy(`${subgroup.slug}.label`)}
            </h1>
          </div>

          {availableSpecialties.length > 0 && (
            <div className="w-full max-w-xs">
              <Select value={specialtyFilter} onValueChange={setSpecialtyFilter}>
                <SelectTrigger>
                  <SelectValue placeholder={t('specialtyPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SPECIALTIES}>{t('allSpecialties')}</SelectItem>
                  {availableSpecialties.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {visibleCases.length === 0 ? (
            <Card className="bg-muted/30">
              <CardContent className="p-8 text-center text-muted-foreground">
                {t('noCases')}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 pb-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleCases.map((c) => {
                const preview = (c.teaser?.trim() || caseBodyPreview(c.body ?? null, 140));
                const isPending = pendingId === c.id;
                const hasOtherPending = pendingId !== null && !isPending;
                const ariaLabel = t('ariaOpenCase', { name: c.name });
                return (
                  <Card
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    aria-label={ariaLabel}
                    aria-busy={isPending}
                    onClick={() => handleOpen(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleOpen(c.id);
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
                    <div
                      className="absolute right-2 top-2 z-10"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <SaveCaseButton
                        caseId={c.id}
                        variant="icon"
                        initialSaved={savedIds.has(c.id)}
                      />
                    </div>
                    <CardHeader className="space-y-2 pr-10">
                      <CardTitle className="text-lg leading-snug text-foreground">
                        {c.name}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {c.specialty ?? t('noSpecialty')}
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
                          {c.tags.slice(0, 5).map((t) => (
                            <Badge key={t} variant="secondary" className="text-[10px]">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-auto flex items-center justify-between border-t border-border/40 pt-3 text-xs text-muted-foreground">
                        <span>
                          {c.attachedImages?.length || c.images?.length
                            ? t('attachmentsCount', { count: c.attachedImages?.length ?? c.images?.length ?? 0 })
                            : t('noAttachments')}
                        </span>
                        <span className="flex items-center gap-1 text-primary opacity-0 transition group-hover:opacity-100">
                          {t('openCardCta')}
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
          )}
        </div>
      </main>
    </DashboardLayout>
  );
}
