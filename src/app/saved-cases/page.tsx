'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, Star, ChevronRight } from 'lucide-react';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useUserStore } from '@/hooks/use-user-store';
import {
  getSavedCases,
  toggleSavedCase,
  type SerializedSavedCase,
} from '@/app/actions';
import { subgroupLabel } from '@/lib/case-taxonomy';

export default function SavedCasesPage() {
  const { currentUser, isInitialized } = useUserStore();
  const router = useRouter();
  const t = useTranslations('savedCases');
  const { toast } = useToast();
  const [items, setItems] = useState<SerializedSavedCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!isInitialized) return;
    if (!currentUser) {
      router.push('/login');
      return;
    }
    void load();
  }, [isInitialized, currentUser, router]);

  const load = async () => {
    setLoading(true);
    const res = await getSavedCases();
    if (res.success) setItems(res.data);
    setLoading(false);
  };

  const handleRemove = (caseId: string) => {
    startTransition(async () => {
      const res = await toggleSavedCase(caseId);
      if (!res.success) {
        toast({ variant: 'destructive', title: res.error });
        return;
      }
      setItems((prev) => prev.filter((i) => i.caseId !== caseId));
    });
  };

  return (
    <DashboardLayout sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}>
      <main className="h-full overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-5xl space-y-6 pb-12">
          <div>
            <h1 className="font-headline text-3xl font-semibold">{t('title')}</h1>
            <p className="mt-1 text-muted-foreground">{t('description')}</p>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <Card className="p-12 text-center">
              <Star className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">{t('empty')}</p>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {items.map((s) => (
                <Card key={s.id} className="flex h-full flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg leading-snug">{s.case.name}</CardTitle>
                        {s.case.subgroup ? (
                          <Badge variant="secondary" className="mt-2">
                            {subgroupLabel(s.case.subgroup) ?? s.case.subgroup}
                          </Badge>
                        ) : null}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        title={t('removeButton')}
                        onClick={() => handleRemove(s.caseId)}
                      >
                        <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                      </Button>
                    </div>
                    {s.case.teaser ? (
                      <CardDescription className="line-clamp-3 pt-2">
                        {s.case.teaser}
                      </CardDescription>
                    ) : null}
                  </CardHeader>
                  <CardContent className="mt-auto pt-0">
                    <Link
                      href={`/cases/${s.case.subgroup ?? 'clinical'}/${s.case.id}`}
                      className="inline-flex items-center text-sm text-primary hover:underline"
                    >
                      {t('openButton')}
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </DashboardLayout>
  );
}
