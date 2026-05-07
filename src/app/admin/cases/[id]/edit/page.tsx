'use client';

import { useEffect, useMemo, useState, use } from 'react';
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
import {
  getCaseById,
  getCaseSolution,
  updateCase,
  type SerializedCase,
} from '@/app/actions';
import { StringListField } from '@/app/new-case/_components/string-list-field';
import { SolutionForm } from '@/app/new-case/_components/solution-form';
import {
  expectedSolutionKind,
  type CaseSolution,
  type IncidentSolution,
  type ReflectionSolution,
} from '@/lib/case-schema';

function emptySolutionFor(kind: 'incident' | 'reflection'): CaseSolution {
  if (kind === 'incident') {
    return {
      kind: 'incident',
      diagnosis: '',
      errors: [],
      correctAlgorithm: '',
      preventability: 'conditional',
    } satisfies IncidentSolution;
  }
  return {
    kind: 'reflection',
    keyInsights: [],
    correctDecisions: [],
    lessonsLearned: '',
  } satisfies ReflectionSolution;
}

type AdminCaseEditPageProps = {
  params: Promise<{ id: string }>;
};

export default function AdminCaseEditPage({ params }: AdminCaseEditPageProps) {
  const { id: caseId } = use(params);
  const { currentUser, isInitialized } = useUserStore();
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('admin.edit');

  const [caseData, setCaseData] = useState<SerializedCase | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [name, setName] = useState('');
  const [teaser, setTeaser] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [taskQuestions, setTaskQuestions] = useState<string[]>(['']);
  const [solution, setSolution] = useState<CaseSolution | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

  useEffect(() => {
    if (!isInitialized || !currentUser || currentUser.role !== 'admin') return;
    let cancelled = false;
    (async () => {
      const [caseRes, solRes] = await Promise.all([
        getCaseById(caseId),
        getCaseSolution(caseId),
      ]);
      if (cancelled) return;
      if (!caseRes.success) {
        setLoadError(true);
        return;
      }
      const c = caseRes.data;
      setCaseData(c);
      setName(c.name);
      setTeaser(c.teaser ?? '');
      setTags(c.tags);
      setTaskQuestions(c.taskQuestions.length ? c.taskQuestions : ['']);
      const expected = expectedSolutionKind(c.mode);
      const loadedSolution = solRes.success ? solRes.data.solution : null;
      setSolution(
        loadedSolution && loadedSolution.kind === expected
          ? loadedSolution
          : emptySolutionFor(expected),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId, isInitialized, currentUser]);

  const expectedKind = useMemo(
    () => (caseData ? expectedSolutionKind(caseData.mode) : null),
    [caseData],
  );

  const handleSave = async () => {
    if (!caseData) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ variant: 'destructive', title: t('errorTitle'), description: t('saveFailed') });
      return;
    }
    const cleanedTasks = taskQuestions.map((q) => q.trim()).filter(Boolean);

    setIsSaving(true);
    try {
      const result = await updateCase({
        id: caseData.id,
        name: trimmedName,
        teaser: teaser.trim() || null,
        tags,
        taskQuestions: cleanedTasks,
        solution: solution ?? undefined,
      });
      if (!result.success) {
        toast({ variant: 'destructive', title: t('errorTitle'), description: result.error });
        return;
      }
      toast({ title: t('savedTitle') });
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
              <Label htmlFor="case-teaser">Тизер (краткий анонс)</Label>
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

        <Card>
          <CardHeader>
            <CardTitle>Задание</CardTitle>
            <CardDescription>Список вопросов, на которые студент должен ответить.</CardDescription>
          </CardHeader>
          <CardContent>
            <StringListField
              items={taskQuestions}
              placeholder={(i) => `Вопрос ${i + 1}`}
              addLabel="Добавить вопрос"
              onChange={setTaskQuestions}
            />
          </CardContent>
        </Card>

        {solution && expectedKind ? (
          <Card>
            <CardHeader>
              <CardTitle>Правильный ответ</CardTitle>
              <CardDescription>
                Скрыт от студента до завершения кейса. Тип: {expectedKind}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SolutionForm value={solution} onChange={setSolution} />
            </CardContent>
          </Card>
        ) : null}

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
