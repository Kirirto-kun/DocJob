'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import { useUserStore } from '@/hooks/use-user-store';
import { usePatientStore, type Patient } from '@/hooks/use-patient-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const patientSchema = z.object({
  name: z.string().min(1, 'Укажите имя пациента'),
  age: z.coerce.number().min(0, 'Возраст не может быть отрицательным'),
  gender: z.string().min(1, 'Укажите пол'),
  primaryCondition: z.string().min(1, 'Укажите основное состояние'),
  history: z.string().min(1, 'Заполните анамнез'),
});

type PatientFormValues = z.infer<typeof patientSchema>;

export default function AddPatientPage() {
  const { currentUser, isInitialized } = useUserStore();
  const { addPatient } = usePatientStore();
  const { toast } = useToast();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isInitialized) {
      if (!currentUser) {
        router.push('/login');
      } else if (currentUser.role !== 'admin' && currentUser.role !== 'doctor') {
        router.push('/');
      }
    }
  }, [currentUser, router, isInitialized]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PatientFormValues>({
    resolver: zodResolver(patientSchema),
  });

  const onSubmit: SubmitHandler<PatientFormValues> = async (data) => {
    if (!currentUser) return;

    setIsLoading(true);
    try {
      const patient: Patient = {
        id: '',
        doctorId: currentUser.id,
        name: data.name,
        age: data.age,
        gender: data.gender,
        primaryCondition: data.primaryCondition,
        history: data.history,
        scenario: {
          scenarioDescription: 'Ожидается генерация сценария.',
          learningObjectives: ['Ознакомиться с пациентом и подготовиться к диалогу.'],
          comorbidities: '',
        },
      };
      await addPatient(patient);
      toast({ title: 'Пациент добавлен', description: `${data.name} добавлен в базу кейсов.` });
      router.push('/manage-patients');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Не удалось добавить пациента';
      toast({ variant: 'destructive', title: 'Ошибка', description: msg });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isInitialized || !currentUser) {
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
          <h1 className="text-2xl md:text-3xl font-bold text-primary font-headline">Добавить пациента</h1>
        </header>
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Клинические данные</CardTitle>
            <CardDescription>
              Базовый кейс пациента. Расширенное создание кейсов с картинками и тегами — в разделе «Создать кейс» у администратора.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Label htmlFor="name">Имя пациента</Label>
                <Input id="name" {...register('name')} />
                {errors.name && <p className="text-destructive text-sm mt-1">{errors.name.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="age">Возраст</Label>
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
                {errors.primaryCondition && <p className="text-destructive text-sm mt-1">{errors.primaryCondition.message}</p>}
              </div>
              <div>
                <Label htmlFor="history">Анамнез</Label>
                <Textarea id="history" {...register('history')} />
                {errors.history && <p className="text-destructive text-sm mt-1">{errors.history.message}</p>}
              </div>

              <Button type="submit" className="w-full !mt-8" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Добавить пациента
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </DashboardLayout>
  );
}
