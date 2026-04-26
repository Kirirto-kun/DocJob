
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldAlert, FileText } from 'lucide-react';
import DashboardLayout from '@/components/dashboard-layout';
import PatientInfoCard from '@/components/patient-info-card';
import InteractiveQA from '@/components/interactive-qa';
import ScenarioControls from '@/components/scenario-controls';
import { Card, CardDescription, CardTitle, CardFooter, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useUserStore } from '@/hooks/use-user-store';
import { usePatientStore } from '@/hooks/use-patient-store';

export default function Home() {
  const { currentUser, isInitialized: userIsInitialized, allUsers } = useUserStore();
  const { activePatient, isInitialized: patientIsInitialized } = usePatientStore();
  const router = useRouter();

  const isLoading = !userIsInitialized || !patientIsInitialized;

  useEffect(() => {
    if (!isLoading && !currentUser) {
      router.push('/login');
    }
  }, [currentUser, isLoading, router]);

  const MainContent = () => {
    if (isLoading) {
      return (
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      );
    }

    if (!currentUser) {
      // This will be briefly visible before the useEffect above redirects
      return <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
    }


    if (currentUser.role === 'doctor') {
      const legacyCaseId = activePatient?.id;
      const legacySubgroup = activePatient?.subgroup;
      return (
        <Card className="m-auto flex flex-col items-center justify-center p-12 text-center bg-card/80 animate-fade-in">
          <ShieldAlert className="h-12 w-12 text-accent mb-4" />
          <CardTitle className="text-2xl font-headline">
            Готовы начать?
          </CardTitle>
          <CardDescription className="mt-2 max-w-md">
            Выберите подгруппу и переходите к нужному кейсу — обсуждение с ИИ-наставником будет прямо на странице кейса.
          </CardDescription>
          <CardFooter className="mt-6 flex flex-col gap-3">
            <Button onClick={() => router.push('/select-subgroup')}>
              Перейти к выбору подгруппы
            </Button>
            <Button variant="outline" onClick={() => router.push('/manage-patients')}>
              Мои кейсы
            </Button>
            {legacyCaseId && legacySubgroup ? (
              <Button
                variant="ghost"
                onClick={() => router.push(`/cases/${legacySubgroup}/${legacyCaseId}`)}
              >
                Продолжить кейс «{activePatient?.name}»
              </Button>
            ) : null}
          </CardFooter>
        </Card>
      );
    }

    if (currentUser.role === 'patient') {
         return (
             <Card className="m-auto w-full max-w-2xl bg-card/80 animate-fade-in">
                 <CardHeader>
                    <CardTitle className="font-headline text-2xl">Добро пожаловать, {currentUser.name}</CardTitle>
                    <CardDescription>Здесь вы можете управлять своими медицинскими записями. Они будут доступны вашему врачу для симуляций.</CardDescription>
                 </CardHeader>
                 <CardContent>
                     <div className="flex items-start gap-4 rounded-lg border bg-muted/50 p-4">
                        <FileText className="h-8 w-8 text-primary mt-1" />
                        <div>
                            <h3 className="font-semibold">Ваши медицинские записи</h3>
                            {currentUser.medicalRecords ? (
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-2">{currentUser.medicalRecords}</p>
                            ) : (
                                <p className="text-sm text-muted-foreground mt-2">Вы ещё не загрузили медицинских записей. Используйте кнопку «Загрузить отчёт» в боковой панели, чтобы добавить файл.</p>
                            )}
                        </div>
                     </div>
                 </CardContent>
             </Card>
         )
    }

    if (currentUser.role === 'admin') {
      const doctorCount = allUsers.filter(u => u.role === 'doctor').length;
      const patientCount = allUsers.filter(u => u.role === 'patient').length;
       return (
        <Card className="m-auto flex flex-col items-center justify-center p-12 text-center bg-card/80 animate-fade-in">
            <CardTitle className="text-2xl font-headline">
                Добро пожаловать, Администратор
            </CardTitle>
            <CardDescription className="mt-2">
                У вас административный доступ к платформе Medizo AI.
            </CardDescription>
            <CardContent className="mt-6 text-left">
                <p className="text-lg">Состояние системы:</p>
                <ul className="list-disc list-inside mt-2 text-muted-foreground">
                    <li><span className="font-bold text-foreground">{doctorCount}</span> Зарегистрированных врачей</li>
                    <li><span className="font-bold text-foreground">{patientCount}</span> Профилей пациентов</li>
                </ul>
            </CardContent>
            <CardFooter>
                 <Button onClick={() => router.push('/add-doctor')}>Добавить врача</Button>
            </CardFooter>
        </Card>
       )
    }

    // Fallback for any other unexpected roles
    return (
        <Card className="m-auto flex flex-col items-center justify-center p-12 text-center bg-card/80 animate-fade-in">
            <CardTitle className="text-2xl font-headline">
                Добро пожаловать, {currentUser.name}
            </CardTitle>
            <CardDescription className="mt-2">
                Ваша панель готова.
            </CardDescription>
        </Card>
    )
  }

  return (
    <DashboardLayout
      sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}
    >
      <main className="flex-1 flex items-center justify-center p-4 md:p-6 lg:p-8">
        <MainContent />
      </main>
    </DashboardLayout>
  );
}
