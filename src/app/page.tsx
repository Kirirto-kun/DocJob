'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, ShieldAlert, FileText } from 'lucide-react';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import { Card, CardDescription, CardTitle, CardFooter, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useUserStore } from '@/hooks/use-user-store';
import { usePatientStore } from '@/hooks/use-patient-store';

export default function Home() {
  const { currentUser, isInitialized: userIsInitialized, allUsers } = useUserStore();
  const { activePatient, isInitialized: patientIsInitialized } = usePatientStore();
  const router = useRouter();
  const t = useTranslations('home');

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
      return <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
    }


    if (currentUser.role === 'doctor') {
      const legacyCaseId = activePatient?.id;
      const legacySubgroup = activePatient?.subgroup;
      return (
        <Card className="m-auto flex flex-col items-center justify-center p-12 text-center bg-card/80 animate-fade-in">
          <ShieldAlert className="h-12 w-12 text-accent mb-4" />
          <CardTitle className="text-2xl font-headline">{t('doctor.title')}</CardTitle>
          <CardDescription className="mt-2 max-w-md">
            {t('doctor.description')}
          </CardDescription>
          <CardFooter className="mt-6 flex flex-col gap-3">
            <Button onClick={() => router.push('/select-subgroup')}>
              {t('doctor.selectSubgroup')}
            </Button>
            <Button variant="outline" onClick={() => router.push('/manage-patients')}>
              {t('doctor.myCases')}
            </Button>
            {legacyCaseId && legacySubgroup ? (
              <Button
                variant="ghost"
                onClick={() => router.push(`/cases/${legacySubgroup}/${legacyCaseId}`)}
              >
                {t('doctor.continueCase', { name: activePatient?.name ?? '' })}
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
                    <CardTitle className="font-headline text-2xl">{t('patient.welcome', { name: currentUser.name })}</CardTitle>
                    <CardDescription>{t('patient.description')}</CardDescription>
                 </CardHeader>
                 <CardContent>
                     <div className="flex items-start gap-4 rounded-lg border bg-muted/50 p-4">
                        <FileText className="h-8 w-8 text-primary mt-1" />
                        <div>
                            <h3 className="font-semibold">{t('patient.recordsTitle')}</h3>
                            {currentUser.medicalRecords ? (
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-2">{currentUser.medicalRecords}</p>
                            ) : (
                                <p className="text-sm text-muted-foreground mt-2">{t('patient.recordsEmpty')}</p>
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
            <CardTitle className="text-2xl font-headline">{t('admin.welcome')}</CardTitle>
            <CardDescription className="mt-2">{t('admin.description')}</CardDescription>
            <CardContent className="mt-6 text-left">
                <p className="text-lg">{t('admin.systemState')}</p>
                <ul className="list-disc list-inside mt-2 text-muted-foreground">
                    <li>{t('admin.doctorCount', { count: doctorCount })}</li>
                    <li>{t('admin.patientCount', { count: patientCount })}</li>
                </ul>
            </CardContent>
            <CardFooter>
                 <Button onClick={() => router.push('/add-doctor')}>{t('admin.addDoctor')}</Button>
            </CardFooter>
        </Card>
       )
    }

    return (
        <Card className="m-auto flex flex-col items-center justify-center p-12 text-center bg-card/80 animate-fade-in">
            <CardTitle className="text-2xl font-headline">{t('fallback.welcome', { name: currentUser.name })}</CardTitle>
            <CardDescription className="mt-2">{t('fallback.description')}</CardDescription>
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
