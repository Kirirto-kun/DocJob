'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Loader2,
  ShieldAlert,
  FileText,
  Star,
  Search,
  PenSquare,
  Inbox,
  FilePlus2,
} from 'lucide-react';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import {
  Card,
  CardDescription,
  CardTitle,
  CardFooter,
  CardHeader,
  CardContent,
} from '@/components/ui/card';
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
      return (
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      );
    }

    if (currentUser.role === 'doctor') {
      const legacyCaseId = activePatient?.id;
      const legacySubgroup = activePatient?.subgroup;
      return (
        <Card className="m-auto flex flex-col items-center justify-center p-8 sm:p-12 text-center bg-card/80 animate-fade-in">
          <ShieldAlert className="h-12 w-12 text-accent mb-4" />
          <CardTitle className="text-2xl font-headline">{t('doctor.title')}</CardTitle>
          <CardDescription className="mt-2 max-w-md">
            {t('doctor.description')}
          </CardDescription>
          <CardFooter className="mt-6 flex flex-col gap-3 w-full max-w-xs">
            <Button className="w-full" onClick={() => router.push('/select-subgroup')}>
              {t('doctor.selectSubgroup')}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push('/saved-cases')}
            >
              <Star className="mr-2 h-4 w-4" />
              {t('doctor.savedCases')}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push('/ai-search')}
            >
              <Search className="mr-2 h-4 w-4" />
              {t('doctor.aiSearch')}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push('/suggest-case')}
            >
              <FilePlus2 className="mr-2 h-4 w-4" />
              {t('doctor.suggestCase')}
            </Button>
            {legacyCaseId && legacySubgroup ? (
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => router.push(`/cases/${legacySubgroup}/${legacyCaseId}`)}
              >
                {t('doctor.continueCase', { name: activePatient?.name ?? '' })}
              </Button>
            ) : null}
          </CardFooter>
        </Card>
      );
    }

    if (currentUser.role === 'reviewer') {
      return (
        <Card className="m-auto flex flex-col items-center justify-center p-8 sm:p-12 text-center bg-card/80 animate-fade-in">
          <PenSquare className="h-12 w-12 text-accent mb-4" />
          <CardTitle className="text-2xl font-headline">{t('reviewer.title')}</CardTitle>
          <CardDescription className="mt-2 max-w-md">
            {t('reviewer.description')}
          </CardDescription>
          <CardFooter className="mt-6 flex flex-col gap-3 w-full max-w-xs">
            <Button className="w-full" onClick={() => router.push('/select-subgroup')}>
              {t('reviewer.selectSubgroup')}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push('/saved-cases')}
            >
              <Star className="mr-2 h-4 w-4" />
              {t('reviewer.savedCases')}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push('/reviewer/my-reviews')}
            >
              <PenSquare className="mr-2 h-4 w-4" />
              {t('reviewer.myReviews')}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push('/ai-search')}
            >
              <Search className="mr-2 h-4 w-4" />
              {t('reviewer.aiSearch')}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push('/suggest-case')}
            >
              <FilePlus2 className="mr-2 h-4 w-4" />
              {t('reviewer.suggestCase')}
            </Button>
          </CardFooter>
        </Card>
      );
    }

    if (currentUser.role === 'patient') {
      return (
        <Card className="m-auto w-full max-w-2xl bg-card/80 animate-fade-in">
          <CardHeader>
            <CardTitle className="font-headline text-2xl">
              {t('patient.welcome', { name: currentUser.name })}
            </CardTitle>
            <CardDescription>{t('patient.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-4 rounded-lg border bg-muted/50 p-4">
              <FileText className="h-8 w-8 text-primary mt-1" />
              <div>
                <h3 className="font-semibold">{t('patient.recordsTitle')}</h3>
                {currentUser.medicalRecords ? (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-2">
                    {currentUser.medicalRecords}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground mt-2">
                    {t('patient.recordsEmpty')}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (currentUser.role === 'admin') {
      const doctorCount = allUsers.filter((u) => u.role === 'doctor').length;
      const patientCount = allUsers.filter((u) => u.role === 'patient').length;
      const reviewerCount = allUsers.filter((u) => u.role === 'reviewer').length;
      return (
        <Card className="m-auto flex flex-col items-center justify-center p-8 sm:p-12 text-center bg-card/80 animate-fade-in">
          <CardTitle className="text-2xl font-headline">{t('admin.welcome')}</CardTitle>
          <CardDescription className="mt-2">{t('admin.description')}</CardDescription>
          <CardContent className="mt-6 text-left">
            <p className="text-lg">{t('admin.systemState')}</p>
            <ul className="list-disc list-inside mt-2 text-muted-foreground">
              <li>{t('admin.doctorCount', { count: doctorCount })}</li>
              <li>{t('admin.reviewerCount', { count: reviewerCount })}</li>
              <li>{t('admin.patientCount', { count: patientCount })}</li>
            </ul>
          </CardContent>
          <CardFooter className="flex flex-col gap-2 w-full max-w-xs">
            <Button className="w-full" onClick={() => router.push('/add-doctor')}>
              {t('admin.addDoctor')}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push('/ai-search')}
            >
              <Search className="mr-2 h-4 w-4" />
              {t('admin.aiSearch')}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push('/admin/case-submissions')}
            >
              <Inbox className="mr-2 h-4 w-4" />
              {t('admin.caseSubmissions')}
            </Button>
          </CardFooter>
        </Card>
      );
    }

    return (
      <Card className="m-auto flex flex-col items-center justify-center p-12 text-center bg-card/80 animate-fade-in">
        <CardTitle className="text-2xl font-headline">
          {t('fallback.welcome', { name: currentUser.name })}
        </CardTitle>
        <CardDescription className="mt-2">{t('fallback.description')}</CardDescription>
      </Card>
    );
  };

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
