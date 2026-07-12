'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import { AnnouncementEditor } from '@/components/admin/announcement-editor';
import { useUserStore } from '@/hooks/use-user-store';

export default function AdminAnnouncementCreatePage() {
  const { currentUser, isInitialized } = useUserStore();
  const router = useRouter();

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

  if (!isInitialized || !currentUser || currentUser.role !== 'admin') {
    return (
      <DashboardLayout sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return <AnnouncementEditor mode="create" />;
}
