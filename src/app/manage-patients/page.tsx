
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import { useUserStore } from '@/hooks/use-user-store';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import PatientList from '@/components/patient-list';
import { useToast } from '@/hooks/use-toast';


export default function ManagePatientsPage() {
  const { currentUser, isInitialized } = useUserStore();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (isInitialized) {
        if (!currentUser) {
          router.push('/login');
        } else if (currentUser.role !== 'doctor') {
            toast({
                variant: 'destructive',
                title: 'Доступ запрещён',
                description: 'У вас нет прав для управления кейсами.',
            });
            router.push('/');
        }
    }
  }, [currentUser, router, isInitialized, toast]);

  if (!isInitialized || !currentUser || currentUser.role !== 'doctor') {
    return (
      <DashboardLayout sidebarContent={null}>
        <main className="flex h-screen w-full items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </main>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}
    >
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold text-primary font-headline">Мои кейсы</h1>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Мои кейсы: {currentUser.name}</CardTitle>
            <CardDescription>Выберите кейс для начала диалога или управления записями.</CardDescription>
          </CardHeader>
          <CardContent>
            <PatientList doctorId={currentUser.id} />
          </CardContent>
        </Card>

      </main>
    </DashboardLayout>
  );
}
