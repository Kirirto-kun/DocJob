'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useUserStore } from '@/hooks/use-user-store';
import { deleteAnnouncement, getAnnouncements, type SerializedAnnouncement } from '@/app/actions';

export default function AdminAnnouncementsPage() {
  const { currentUser, isInitialized } = useUserStore();
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('announcements');

  const [items, setItems] = useState<SerializedAnnouncement[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
      const res = await getAnnouncements();
      if (cancelled) return;
      if (res.success) {
        setItems(res.data);
      } else {
        setItems([]);
        toast({ variant: 'destructive', title: res.error });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isInitialized, currentUser, toast]);

  const handleDelete = async (item: SerializedAnnouncement) => {
    setBusyId(item.id);
    const res = await deleteAnnouncement(item.id);
    setBusyId(null);
    if (res.success) {
      setItems((prev) => prev?.filter((n) => n.id !== item.id) ?? null);
      toast({ title: t('deleted') });
    } else {
      toast({ variant: 'destructive', title: res.error });
    }
  };

  if (!isInitialized || !currentUser || currentUser.role !== 'admin') {
    return (
      <DashboardLayout sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}>
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-primary" />
              <h1 className="text-2xl md:text-3xl font-bold text-primary font-headline">
                {t('adminTitle')}
              </h1>
            </div>
            <p className="text-sm text-muted-foreground">{t('adminSubtitle')}</p>
          </div>
          <Button asChild>
            <Link href="/admin/announcements/new">
              <Plus className="mr-1 h-4 w-4" />
              {t('create')}
            </Link>
          </Button>
        </header>

        {items === null ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <Card className="bg-muted/30">
            <CardContent className="p-8 text-center text-muted-foreground">{t('empty')}</CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {items.map((item) => (
              <Card key={item.id} className="transition-colors hover:border-primary/40">
                <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold">{item.title}</h3>
                      {!item.active && (
                        <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {t('inactive')}
                        </span>
                      )}
                    </div>
                    {item.body ? (
                      <p className="mt-2 line-clamp-2 text-sm text-foreground/85">
                        {item.body.length > 120 ? `${item.body.slice(0, 120)}…` : item.body}
                      </p>
                    ) : null}
                    {item.expiresAt ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('expiresAtLabel')}: {new Date(item.expiresAt).toLocaleDateString()}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-shrink-0 flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/announcements/${item.id}/edit`}>
                        <Pencil className="mr-1 h-4 w-4" />
                        {t('edit')}
                      </Link>
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busyId === item.id}
                          className="text-destructive hover:text-destructive"
                        >
                          {busyId === item.id ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="mr-1 h-4 w-4" />
                          )}
                          {t('delete')}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
                          <AlertDialogDescription>{t('deleteConfirm')}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(item)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {t('delete')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </DashboardLayout>
  );
}
