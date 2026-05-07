'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, Files, Loader2, Pencil, Trash2 } from 'lucide-react';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
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
import { useToast } from '@/hooks/use-toast';
import { useUserStore } from '@/hooks/use-user-store';
import { deleteCase, getCases, type SerializedCase } from '@/app/actions';

const MODE_LABELS: Record<string, string> = {
  CLINICAL_QUEST: 'Клинический',
  SANEPID_INVESTIGATION: 'Санэпид',
  BEST_PRACTICE: 'Лучшая практика',
  MANAGEMENT: 'Менеджмент',
};

export default function AdminCasesPage() {
  const { currentUser, isInitialized } = useUserStore();
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('admin.cases');
  const tTaxonomy = useTranslations('taxonomy.subgroup');
  const locale = useLocale();

  const [cases, setCases] = useState<SerializedCase[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!isInitialized || !currentUser || currentUser.role !== 'admin') return;
    let cancelled = false;
    (async () => {
      const res = await getCases();
      if (cancelled) return;
      if (res.success) {
        setCases(res.data);
      } else {
        setCases([]);
        toast({
          variant: 'destructive',
          title: t('toast.errorTitle'),
          description: t('toast.loadFailed'),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isInitialized, currentUser, t, toast]);

  const dateFormatter = new Intl.DateTimeFormat(locale === 'kk' ? 'kk-KZ' : 'ru-RU', {
    dateStyle: 'short',
  });

  const subgroupLabel = (slug: string | null) => {
    if (!slug) return '—';
    try {
      return tTaxonomy(`${slug}.label`);
    } catch {
      return slug;
    }
  };

  const handleDelete = async (caseItem: SerializedCase) => {
    setBusyId(caseItem.id);
    const res = await deleteCase(caseItem.id);
    setBusyId(null);
    if (res.success) {
      setCases((prev) => prev?.filter((c) => c.id !== caseItem.id) ?? null);
      toast({
        title: t('toast.deletedTitle'),
        description: t('toast.deletedDescription', { name: caseItem.name }),
      });
    } else {
      toast({
        variant: 'destructive',
        title: t('toast.errorTitle'),
        description: res.error ?? t('toast.deleteFailed'),
      });
    }
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

        {cases === null ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : cases.length === 0 ? (
          <Card className="bg-muted/30">
            <CardContent className="p-8 text-center text-muted-foreground">
              {t('empty')}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {cases.map((c) => (
              <Card key={c.id} className="transition-colors hover:border-primary/40">
                <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold">{c.name}</h3>
                      <Badge variant="secondary" className="text-[10px]">
                        {MODE_LABELS[c.mode] ?? c.mode}
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
                            onClick={() => handleDelete(c)}
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
        )}
      </main>
    </DashboardLayout>
  );
}
