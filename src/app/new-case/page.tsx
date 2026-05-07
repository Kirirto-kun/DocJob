'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import { CaseEditor } from '@/components/case-editor';
import { AttachmentsManager, type ManagedAttachment } from '@/components/attachments-manager';
import { TagPicker } from '@/components/tag-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useUserStore } from '@/hooks/use-user-store';
import { createCase } from '@/app/actions';
import {
  CASE_MODE_BY_SUBGROUP,
  EMPTY_BODY,
  expectedSolutionKind,
  type CaseBody,
  type CaseMode,
  type CaseSolution,
  type IncidentSolution,
  type ReflectionSolution,
  type StructuredCaseDraft,
} from '@/lib/case-schema';
import { SUBGROUPS, findSubgroup, type Subgroup, type SubgroupSlug } from '@/lib/case-taxonomy';
import { MarkdownImportDialog } from './_components/markdown-import-dialog';
import { SolutionForm } from './_components/solution-form';
import { StringListField } from './_components/string-list-field';

const MODE_LABELS: Record<CaseMode, string> = {
  CLINICAL_QUEST: 'Клинический инцидент',
  SANEPID_INVESTIGATION: 'Санэпид расследование',
  BEST_PRACTICE: 'Лучшая практика',
  MANAGEMENT: 'Менеджмент',
};

const PATIENT_DEMOGRAPHICS_SUBGROUPS: ReadonlySet<SubgroupSlug> = new Set(['clinical', 'sanepid']);

const GENDER_OPTIONS = [
  { value: 'М', label: 'М' },
  { value: 'Ж', label: 'Ж' },
  { value: 'смешанный', label: 'смешанный' },
];

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

function bodyFromMarkdown(markdown: string): CaseBody {
  const trimmed = markdown.trim();
  if (!trimmed) return EMPTY_BODY;
  return {
    blocks: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: trimmed, styles: {} }],
      },
    ],
  };
}

function isBodyEmpty(body: CaseBody): boolean {
  const blocks = (body.blocks ?? []) as unknown[];
  return blocks.length === 0;
}

export default function NewCasePage() {
  const { currentUser, isInitialized } = useUserStore();
  const { toast } = useToast();
  const router = useRouter();

  const [subgroupSlug, setSubgroupSlug] = useState<SubgroupSlug | ''>('');
  const [specialty, setSpecialty] = useState('');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [teaser, setTeaser] = useState('');

  const [body, setBody] = useState<CaseBody>(EMPTY_BODY);
  const [taskQuestions, setTaskQuestions] = useState<string[]>(['']);
  const [solution, setSolution] = useState<CaseSolution | null>(null);
  const [attachments, setAttachments] = useState<ManagedAttachment[]>([]);

  const [activeTab, setActiveTab] = useState<'body' | 'files' | 'tasks' | 'solution'>('body');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const subgroup: Subgroup | undefined = useMemo(
    () => (subgroupSlug ? findSubgroup(subgroupSlug) : undefined),
    [subgroupSlug],
  );
  const mode: CaseMode | null = subgroupSlug ? CASE_MODE_BY_SUBGROUP[subgroupSlug] : null;
  const showDemographics = subgroupSlug ? PATIENT_DEMOGRAPHICS_SUBGROUPS.has(subgroupSlug) : false;

  useEffect(() => {
    if (!isInitialized) return;
    if (!currentUser) {
      router.push('/login');
      return;
    }
    if (currentUser.role !== 'admin') {
      toast({
        variant: 'destructive',
        title: 'Нет доступа',
        description: 'Создавать кейсы может только администратор.',
      });
      router.push('/');
    }
  }, [currentUser, router, toast, isInitialized]);

  useEffect(() => {
    if (!mode) {
      setSolution(null);
      return;
    }
    const expected = expectedSolutionKind(mode);
    setSolution((prev) => (prev && prev.kind === expected ? prev : emptySolutionFor(expected)));
  }, [mode]);

  useEffect(() => {
    if (!showDemographics) {
      setAge('');
      setGender('');
    }
  }, [showDemographics]);

  const handleSelectSubgroup = (slug: SubgroupSlug) => {
    setSubgroupSlug(slug);
    setSpecialty('');
  };

  const applyDraft = (draft: StructuredCaseDraft) => {
    if (draft.name) setName(draft.name);
    if (draft.age != null && showDemographics) setAge(String(draft.age));
    if (draft.gender && showDemographics) setGender(draft.gender);
    if (draft.specialty && subgroup?.specialties.includes(draft.specialty)) {
      setSpecialty(draft.specialty);
    }
    if (draft.tags.length) setTags((prev) => Array.from(new Set([...prev, ...draft.tags])));
    if (draft.bodyMarkdown) setBody(bodyFromMarkdown(draft.bodyMarkdown));
    if (draft.taskQuestions.length) setTaskQuestions(draft.taskQuestions);
    if (mode && draft.solution.kind === expectedSolutionKind(mode)) {
      setSolution(draft.solution);
    }
    toast({
      title: 'Черновик заполнен',
      description: 'Проверьте все поля и при необходимости перенесите тело в редактор вручную.',
    });
  };

  const handleSubmit = async () => {
    if (!currentUser || !subgroup || !mode) return;
    const trimmedName = name.trim();
    const cleanedTasks = taskQuestions.map((t) => t.trim()).filter(Boolean);

    if (!trimmedName) {
      toast({ variant: 'destructive', title: 'Укажите название кейса' });
      return;
    }
    if (isBodyEmpty(body)) {
      toast({ variant: 'destructive', title: 'Заполните тело кейса' });
      setActiveTab('body');
      return;
    }
    if (cleanedTasks.length === 0) {
      toast({ variant: 'destructive', title: 'Добавьте хотя бы один вопрос задания' });
      setActiveTab('tasks');
      return;
    }
    if (solution && solution.kind !== expectedSolutionKind(mode)) {
      toast({
        variant: 'destructive',
        title: 'Тип ответа не соответствует подгруппе',
      });
      setActiveTab('solution');
      return;
    }

    setIsSubmitting(true);
    try {
      const ageNum = age.trim() ? Number.parseInt(age, 10) : null;
      const result = await createCase({
        name: trimmedName,
        age: showDemographics && Number.isFinite(ageNum) ? ageNum : null,
        gender: showDemographics && gender ? gender : null,
        subgroup: subgroup.slug,
        specialty: specialty || null,
        tags,
        teaser: teaser.trim() || null,
        mode,
        body,
        solution,
        taskQuestions: cleanedTasks,
        attachmentIds: attachments.map((a) => a.id),
      });
      if (!result.success) {
        toast({ variant: 'destructive', title: 'Ошибка', description: result.error });
        return;
      }
      toast({ title: 'Кейс создан' });
      router.push(`/cases/${subgroup.slug}/${result.data.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Не удалось создать кейс';
      toast({ variant: 'destructive', title: 'Ошибка', description: msg });
    } finally {
      setIsSubmitting(false);
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
          <h1 className="text-2xl md:text-3xl font-bold text-primary font-headline">Новый кейс</h1>
          <p className="text-sm text-muted-foreground">
            Заполните метаданные, тело кейса, задание и эталонный ответ.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Метаданные</CardTitle>
            <CardDescription>Подгруппа задаёт режим симулятора и набор полей ответа.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Подгруппа</Label>
                <Select value={subgroupSlug} onValueChange={(v) => handleSelectSubgroup(v as SubgroupSlug)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите подгруппу" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBGROUPS.map((s) => (
                      <SelectItem key={s.slug} value={s.slug}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Специальность</Label>
                <Select
                  value={specialty}
                  onValueChange={setSpecialty}
                  disabled={!subgroup}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={subgroup ? 'Выберите специальность' : 'Сначала выберите подгруппу'} />
                  </SelectTrigger>
                  <SelectContent>
                    {(subgroup?.specialties ?? []).map((sp) => (
                      <SelectItem key={sp} value={sp}>
                        {sp}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="case-name">Название кейса</Label>
              <Input
                id="case-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Краткое запоминающееся название"
              />
            </div>

            {showDemographics && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="case-age">Возраст пациента</Label>
                  <Input
                    id="case-age"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Пол</Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger>
                      <SelectValue placeholder="Не указан" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDER_OPTIONS.map((g) => (
                        <SelectItem key={g.value} value={g.value}>
                          {g.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="case-teaser">Тизер (краткий анонс)</Label>
              <Textarea
                id="case-teaser"
                value={teaser}
                onChange={(e) => setTeaser(e.target.value)}
                rows={3}
                placeholder="Короткое описание для карточки в каталоге кейсов. Если оставить пустым — будет показано начало тела кейса."
              />
              <p className="text-[11px] text-muted-foreground">
                Заменяет первые ~140 символов тела кейса на карточке в списке.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Теги</Label>
              <TagPicker value={tags} onChange={setTags} />
            </div>

            {mode && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Режим симулятора:</span>
                <Badge variant="secondary">{MODE_LABELS[mode]}</Badge>
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList>
            <TabsTrigger value="body">Тело кейса</TabsTrigger>
            <TabsTrigger value="files">Файлы</TabsTrigger>
            <TabsTrigger value="tasks">Задание</TabsTrigger>
            <TabsTrigger value="solution" disabled={!subgroup}>
              Правильный ответ
            </TabsTrigger>
          </TabsList>

          <TabsContent value="body" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Тело кейса</CardTitle>
                  <CardDescription>
                    Видимая студенту часть: жалобы, анамнез, исследования.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setImportDialogOpen(true)}
                  disabled={!mode}
                >
                  Импорт из markdown
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                  <p className="font-medium text-foreground">Подсказки по редактору (как Word)</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    <li>Выделите текст — появится панель: <strong>жирный</strong>, <em>курсив</em>, подчёркивание, цвет текста, выделение цветом, ссылки.</li>
                    <li>Введите <code className="rounded bg-muted px-1 py-0.5">/</code> в начале строки — меню вставки: заголовки, списки, таблицы, изображения, файлы.</li>
                    <li>Перетаскивайте картинки и PDF прямо в редактор — они загрузятся и встанут в текст.</li>
                  </ul>
                </div>
                <CaseEditor initialBody={body} onChange={setBody} />
                {!mode && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Импорт из markdown доступен после выбора подгруппы.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="files" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Файлы и материалы</CardTitle>
                <CardDescription>
                  Прикрепите любые файлы — картинки, PDF, документы. Студент увидит их прямо на странице кейса целиком.
                  Каждому файлу можно дать название и краткое описание.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AttachmentsManager attachments={attachments} onChange={setAttachments} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tasks" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Задание</CardTitle>
                <CardDescription>
                  Список вопросов, на которые студент должен ответить.
                </CardDescription>
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
          </TabsContent>

          <TabsContent value="solution" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Правильный ответ</CardTitle>
                <CardDescription>
                  Скрыт от студента до завершения кейса.
                  {mode ? ` Тип: ${expectedSolutionKind(mode)}.` : ''}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!subgroup || !solution ? (
                  <p className="text-sm text-muted-foreground">
                    Сначала выберите подгруппу — форма ответа зависит от типа кейса.
                  </p>
                ) : (
                  <SolutionForm value={solution} onChange={setSolution} />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end">
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !subgroup}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Создать кейс
          </Button>
        </div>

        {mode && subgroup && (
          <MarkdownImportDialog
            open={importDialogOpen}
            onOpenChange={setImportDialogOpen}
            mode={mode}
            hintedSubgroup={subgroup.label}
            hintedSpecialty={specialty || undefined}
            onApply={applyDraft}
          />
        )}
      </main>
    </DashboardLayout>
  );
}
