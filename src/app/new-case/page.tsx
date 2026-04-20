'use client';

import { useState, useEffect, useRef, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import { useUserStore } from '@/hooks/use-user-store';
import { usePatientStore, type Patient } from '@/hooks/use-patient-store';
import { useTagStore } from '@/hooks/use-tag-store';
import { SUBGROUPS, type Subgroup } from '@/lib/case-taxonomy';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, X, Upload } from 'lucide-react';

const caseSchema = z.object({
  name: z.string().min(1, 'Укажите название кейса'),
  age: z
    .union([
      z.coerce.number().min(0, 'Возраст не может быть отрицательным'),
      z.literal('').transform(() => undefined),
    ])
    .optional(),
  gender: z.string().optional(),
  primaryCondition: z.string().min(1, 'Укажите основное состояние'),
  history: z.string().min(1, 'Заполните анамнез'),
  scenarioDescription: z.string().optional(),
});

type CaseFormValues = z.infer<typeof caseSchema>;

type UploadedImage = {
  filename: string;
  mimeType: string;
  url: string;
};

export default function NewCasePage() {
  const { currentUser, isInitialized } = useUserStore();
  const { addPatient } = usePatientStore();
  const { tags: knownTags, addTag } = useTagStore();
  const { toast } = useToast();
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedSubgroup, setSelectedSubgroup] = useState<Subgroup | null>(null);
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('');

  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isInitialized) {
      if (!currentUser) {
        router.push('/login');
      } else if (currentUser.role !== 'admin') {
        toast({
          variant: 'destructive',
          title: 'Нет доступа',
          description: 'Создавать кейсы может только администратор.',
        });
        router.push('/');
      }
    }
  }, [currentUser, router, toast, isInitialized]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CaseFormValues>({
    resolver: zodResolver(caseSchema),
  });

  const handleSelectSubgroup = (subgroup: Subgroup) => {
    setSelectedSubgroup(subgroup);
    setSelectedSpecialty('');
    setStep(2);
  };

  const handleConfirmSpecialty = () => {
    if (!selectedSpecialty) {
      toast({ variant: 'destructive', title: 'Выберите специальность' });
      return;
    }
    setStep(3);
  };

  const handleAddTag = async () => {
    const label = tagInput.trim();
    if (!label) return;
    if (tags.includes(label)) {
      setTagInput('');
      return;
    }
    setTags((prev) => [...prev, label]);
    setTagInput('');
    if (!knownTags.includes(label)) {
      try {
        await addTag(label);
      } catch {
        // non-fatal: tag stays on the case even if global registry update fails
      }
    }
  };

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleAddTag();
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      const uploads = await Promise.all(
        Array.from(files).map(async (file) => {
          const fd = new FormData();
          fd.append('file', file);
          const res = await fetch('/api/images/upload', { method: 'POST', body: fd });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Upload failed' }));
            throw new Error(err.error ?? 'Ошибка загрузки изображения');
          }
          return (await res.json()) as UploadedImage;
        })
      );
      setUploadedImages((prev) => [...prev, ...uploads]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Не удалось загрузить изображение';
      toast({ variant: 'destructive', title: 'Ошибка', description: msg });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = (filename: string) => {
    setUploadedImages((prev) => prev.filter((i) => i.filename !== filename));
  };

  const onSubmit: SubmitHandler<CaseFormValues> = async (data) => {
    if (!currentUser || !selectedSubgroup) return;
    setIsLoading(true);
    try {
      const patient: Patient = {
        id: '',
        doctorId: currentUser.id,
        name: data.name,
        age: typeof data.age === 'number' ? data.age : 0,
        gender: data.gender ?? '',
        primaryCondition: data.primaryCondition,
        history: data.history,
        scenario: {
          scenarioDescription: data.scenarioDescription ?? '',
          learningObjectives: [],
          comorbidities: '',
        },
        subgroup: selectedSubgroup.slug,
        specialty: selectedSpecialty,
        tags,
        images: uploadedImages.map((img, order) => ({
          id: '',
          filename: img.filename,
          mimeType: img.mimeType,
          url: img.url,
          order,
        })),
      };
      await addPatient(patient);
      toast({ title: 'Кейс создан' });
      router.push('/');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Не удалось создать кейс';
      toast({ variant: 'destructive', title: 'Ошибка', description: msg });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isInitialized || !currentUser || currentUser.role !== 'admin') {
    return (
      <DashboardLayout sidebarContent={null}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}>
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold text-primary font-headline">Создать кейс</h1>
          <div className="text-sm text-muted-foreground">Шаг {step} из 3</div>
        </header>

        {step === 1 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Выберите подгруппу кейсов</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SUBGROUPS.map((subgroup) => (
                <Card
                  key={subgroup.slug}
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => handleSelectSubgroup(subgroup)}
                >
                  <CardHeader>
                    <CardTitle className="text-lg">{subgroup.label}</CardTitle>
                    <CardDescription>{subgroup.specialties.length} специальностей</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </section>
        )}

        {step === 2 && selectedSubgroup && (
          <section className="space-y-4 max-w-2xl mx-auto w-full">
            <Button variant="ghost" onClick={() => setStep(1)} className="-ml-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Назад
            </Button>
            <Card>
              <CardHeader>
                <CardTitle>Специальность</CardTitle>
                <CardDescription>{selectedSubgroup.label}</CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup value={selectedSpecialty} onValueChange={setSelectedSpecialty} className="space-y-2">
                  {selectedSubgroup.specialties.map((specialty) => (
                    <div key={specialty} className="flex items-center space-x-2">
                      <RadioGroupItem value={specialty} id={`specialty-${specialty}`} />
                      <Label htmlFor={`specialty-${specialty}`} className="cursor-pointer font-normal">
                        {specialty}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                <Button className="mt-6 w-full" onClick={handleConfirmSpecialty} disabled={!selectedSpecialty}>
                  Далее
                </Button>
              </CardContent>
            </Card>
          </section>
        )}

        {step === 3 && selectedSubgroup && (
          <section className="max-w-2xl mx-auto w-full space-y-4">
            <Button variant="ghost" onClick={() => setStep(2)} className="-ml-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Назад
            </Button>
            <Card>
              <CardHeader>
                <CardTitle>Данные кейса</CardTitle>
                <CardDescription>
                  {selectedSubgroup.label} · {selectedSpecialty}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div>
                    <Label htmlFor="name">Название кейса</Label>
                    <Input id="name" {...register('name')} />
                    {errors.name && <p className="text-destructive text-sm mt-1">{errors.name.message}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="age">Возраст пациента</Label>
                      <Input id="age" type="number" {...register('age')} />
                      {errors.age && <p className="text-destructive text-sm mt-1">{errors.age.message}</p>}
                    </div>
                    <div>
                      <Label htmlFor="gender">Пол</Label>
                      <Input id="gender" {...register('gender')} />
                      {errors.gender && <p className="text-destructive text-sm mt-1">{errors.gender.message}</p>}
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="primaryCondition">Основное состояние</Label>
                    <Input id="primaryCondition" {...register('primaryCondition')} />
                    {errors.primaryCondition && (
                      <p className="text-destructive text-sm mt-1">{errors.primaryCondition.message}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="history">Анамнез</Label>
                    <Textarea id="history" rows={4} {...register('history')} />
                    {errors.history && <p className="text-destructive text-sm mt-1">{errors.history.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="scenarioDescription">Описание сценария</Label>
                    <Textarea id="scenarioDescription" rows={3} {...register('scenarioDescription')} />
                  </div>

                  <div className="space-y-2">
                    <Label>Теги</Label>
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="gap-1">
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="hover:text-destructive"
                            aria-label={`Удалить тег ${tag}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={handleTagKeyDown}
                        placeholder="Введите тег и нажмите Enter"
                      />
                      <Button type="button" variant="outline" onClick={() => void handleAddTag()}>
                        Добавить
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Изображения</Label>
                    <div className="flex flex-wrap gap-2">
                      {uploadedImages.map((img) => (
                        <div key={img.filename} className="relative border rounded p-1">
                          <img src={img.url} alt={img.filename} className="h-20 w-20 object-cover rounded" />
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(img.filename)}
                            className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"
                            aria-label={`Удалить ${img.filename}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFilesSelected}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      Загрузить изображения
                    </Button>
                  </div>

                  <Button type="submit" className="w-full !mt-8" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Создать кейс
                  </Button>
                </form>
              </CardContent>
            </Card>
          </section>
        )}
      </main>
    </DashboardLayout>
  );
}
