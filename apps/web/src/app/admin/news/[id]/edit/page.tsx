'use client';

import { useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import NewsEditor from '@/components/admin/news-editor';
import { useToast } from '@/hooks/use-toast';
import { useUserStore } from '@/hooks/use-user-store';
import { trpc } from '@/lib/trpc/react';

type PageProps = { params: Promise<{ id: string }> };

export default function AdminNewsEditPage({ params }: PageProps) {
  const { id } = use(params);
  const { currentUser, isInitialized } = useUserStore();
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('admin.news');

  useEffect(() => {
    if (!isInitialized) return;
    if (!currentUser) {
      router.push('/login');
      return;
    }
    if (currentUser.role !== 'admin') {
      toast({
        variant: 'destructive',
        title: t('accessDeniedTitle'),
        description: t('accessDeniedDescription'),
      });
      router.push('/');
    }
  }, [currentUser, isInitialized, router, toast, t]);

  const isAdmin = isInitialized && !!currentUser && currentUser.role === 'admin';
  const itemQuery = trpc.news.byId.useQuery(id, { enabled: isAdmin });
  const item = itemQuery.data ?? null;

  useEffect(() => {
    if (isAdmin && itemQuery.isError) {
      toast({
        variant: 'destructive',
        title: t('toast.errorTitle'),
        description: itemQuery.error?.message || t('toast.loadItemFailed'),
      });
      router.push('/admin/news');
    }
  }, [isAdmin, itemQuery.isError, itemQuery.error, router, toast, t]);

  if (!isInitialized || !currentUser || currentUser.role !== 'admin' || !item) {
    return (
      <DashboardLayout sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return <NewsEditor mode="edit" initial={item} />;
}
