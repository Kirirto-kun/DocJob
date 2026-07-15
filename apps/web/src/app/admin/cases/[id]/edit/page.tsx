'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Loader2 } from 'lucide-react';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TagPicker } from '@/components/tag-picker';
import { useToast } from '@/hooks/use-toast';
import { useUserStore } from '@/hooks/use-user-store';
import { trpc } from '@/lib/trpc/react';
import type { SerializedCase } from '@docjob/core';

type AdminCaseEditPageProps = {
  params: Promise<{ id: string }>;
};

export default function AdminCaseEditPage({ params }: AdminCaseEditPageProps) {
  const { id: caseId } = use(params);
  const { currentUser, isInitialized } = useUserStore();
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('admin.edit');

  const [name, setName] = useState('');
  const [teaser, setTeaser] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [seededFor, setSeededFor] = useState<string | null>(null);

  useEffect(() => {
    if (!isInitialized) return;
    if (!currentUser) {
      router.push('/login');
      return;
    }
    if (currentUser.role !== 'admin') {
      router.push('/');
    }
  }, [currentUser, isInitialized, router]);

  const isAdmin = isInitialized && !!currentUser && currentUser.role === 'admin';
  const utils = trpc.useUtils();
  // retry: false mirrors the original getCaseById action's single-attempt
  // load — a missing/forbidden case should surface loadError immediately,
  // not after react-query's default retry/backoff.
  const caseQuery = trpc.cases.byId.useQuery(caseId, { enabled: isAdmin, retry: false });
  const caseData: SerializedCase | null = caseQuery.data ?? null;
  const loadError = caseQuery.isError;

  // Seed the editable local fields once per loaded case (mirrors the
  // original one-shot `getCaseById` -> setState effect).
  useEffect(() => {
    if (!caseData || seededFor === caseData.id) return;
    setName(caseData.name);
    setTeaser(caseData.teaser ?? '');
    setTags(caseData.tags);
    setSeededFor(caseData.id);
  }, [caseData, seededFor]);

  const updateMutation = trpc.cases.update.useMutation();

  const handleSave = async () => {
    if (!caseData) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ variant: 'destructive', title: t('errorTitle'), description: t('saveFailed') });
      return;
    }
    setIsSaving(true);
    try {
      await updateMutation.mutateAsync({
        id: caseData.id,
        name: trimmedName,
        teaser: teaser.trim() || null,
        tags,
      });
      toast({ title: t('savedTitle') });
      // RSC cache coherence: replaces the old `updateCase` action's
      // `revalidatePath('/')` + `revalidatePath('/cases/${subgroup}/${id}')`.
      await Promise.all([
        utils.cases.list.invalidate(),
        utils.cases.listPaged.invalidate(),
        utils.cases.byId.invalidate(caseData.id),
      ]);
      router.refresh();
      router.push('/admin/cases');
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('saveFailed');
      toast({ variant: 'destructive', title: t('errorTitle'), description: msg });
    } finally {
      setIsSaving(false);
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

  if (loadError) {
    return (
      <DashboardLayout sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}>
        <main className="flex h-full items-center justify-center p-6">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle>{t('notFoundTitle')}</CardTitle>
              <CardDescription>{t('notFoundDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link href="/admin/cases">
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  {t('backToList')}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </DashboardLayout>
    );
  }

  if (!caseData) {
    return (
      <DashboardLayout sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}>
        <main className="flex h-full items-center justify-center p-6">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            {t('loading')}
          </div>
        </main>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}>
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
        <header className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold text-primary font-headline">
              {t('title')}
            </h1>
            <p className="text-sm text-muted-foreground">{caseData.name}</p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/cases">
              <ArrowLeft className="mr-1 h-4 w-4" />
              {t('backToList')}
            </Link>
          </Button>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Метаданные</CardTitle>
            <CardDescription>
              Подгруппа, специальность и режим симулятора у созданного кейса не меняются.
              Чтобы поменять — удалите кейс и создайте новый.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="case-name">Название кейса</Label>
              <Input
                id="case-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Краткое запоминающееся название"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="case-teaser">Автор кейса</Label>
              <Textarea
                id="case-teaser"
                value={teaser}
                onChange={(e) => setTeaser(e.target.value)}
                rows={3}
                placeholder="Короткое описание для карточки в списке кейсов. Если оставить пустым — будет показано начало тела кейса."
              />
            </div>

            <div className="space-y-2">
              <Label>Теги</Label>
              <TagPicker value={tags} onChange={setTags} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/cases">{t('backToList')}</Link>
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSaving ? t('savingButton') : t('saveButton')}
          </Button>
        </div>
      </main>
    </DashboardLayout>
  );
}
