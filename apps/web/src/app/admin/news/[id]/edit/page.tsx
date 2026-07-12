'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import NewsEditor from '@/components/admin/news-editor';
import { useToast } from '@/hooks/use-toast';
import { useUserStore } from '@/hooks/use-user-store';
import { getNewsItem } from '@/app/actions';

type PageProps = { params: Promise<{ id: string }> };

type NewsItem = { id: string; title: string; body: string; date: string };

export default function AdminNewsEditPage({ params }: PageProps) {
  const { id } = use(params);
  const { currentUser, isInitialized } = useUserStore();
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('admin.news');

  const [item, setItem] = useState<NewsItem | null>(null);

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

  useEffect(() => {
    if (!isInitialized || !currentUser || currentUser.role !== 'admin') return;
    let cancelled = false;
    (async () => {
      const res = await getNewsItem(id);
      if (cancelled) return;
      if (res.success) {
        setItem(res.data);
      } else {
        toast({
          variant: 'destructive',
          title: t('toast.errorTitle'),
          description: res.error || t('toast.loadItemFailed'),
        });
        router.push('/admin/news');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isInitialized, currentUser, router, toast, t]);

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
