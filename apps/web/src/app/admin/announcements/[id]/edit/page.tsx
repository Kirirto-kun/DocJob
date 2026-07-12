'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import { AnnouncementEditor } from '@/components/admin/announcement-editor';
import { useToast } from '@/hooks/use-toast';
import { useUserStore } from '@/hooks/use-user-store';
import { getAnnouncement, type SerializedAnnouncement } from '@/app/actions';

type PageProps = { params: Promise<{ id: string }> };

export default function AdminAnnouncementEditPage({ params }: PageProps) {
  const { id } = use(params);
  const { currentUser, isInitialized } = useUserStore();
  const router = useRouter();
  const { toast } = useToast();

  const [item, setItem] = useState<SerializedAnnouncement | null>(null);

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
      const res = await getAnnouncement(id);
      if (cancelled) return;
      if (res.success) {
        setItem(res.data);
      } else {
        toast({ variant: 'destructive', title: res.error });
        router.push('/admin/announcements');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isInitialized, currentUser, router, toast]);

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
