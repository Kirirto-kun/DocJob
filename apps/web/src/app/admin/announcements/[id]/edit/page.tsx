'use client';

import { useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import { AnnouncementEditor } from '@/components/admin/announcement-editor';
import { useToast } from '@/hooks/use-toast';
import { useUserStore } from '@/hooks/use-user-store';
import { trpc } from '@/lib/trpc/react';

type PageProps = { params: Promise<{ id: string }> };

export default function AdminAnnouncementEditPage({ params }: PageProps) {
  const { id } = use(params);
  const { currentUser, isInitialized } = useUserStore();
  const router = useRouter();
  const { toast } = useToast();

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
  const itemQuery = trpc.announcements.byId.useQuery(id, { enabled: isAdmin });
  const item = itemQuery.data ?? null;

  useEffect(() => {
    if (isAdmin && itemQuery.isError) {
      toast({ variant: 'destructive', title: itemQuery.error?.message });
      router.push('/admin/announcements');
    }
  }, [isAdmin, itemQuery.isError, itemQuery.error, router, toast]);

  if (!isInitialized || !currentUser || currentUser.role !== 'admin' || !item) {
    return (
      <DashboardLayout sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return <AnnouncementEditor mode="edit" initial={item} />;
}
