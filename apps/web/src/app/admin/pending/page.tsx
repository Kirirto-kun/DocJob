'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Loader2, UserCheck, X } from 'lucide-react';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { trpc } from '@/lib/trpc/react';
import type { SerializedUser } from '@docjob/core';

export default function AdminPendingPage() {
  const { currentUser, isInitialized } = useUserStore();
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('admin.pending');
  const locale = useLocale();

  const [busyId, setBusyId] = useState<string | null>(null);
  const utils = trpc.useUtils();

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
  const pendingQuery = trpc.users.pending.useQuery(undefined, { enabled: isAdmin });
  const pending: SerializedUser[] | null = isAdmin ? (pendingQuery.data ?? null) : null;

  useEffect(() => {
    if (pendingQuery.isError) {
      toast({
        variant: 'destructive',
        title: t('toast.errorTitle'),
        description: t('toast.loadFailed'),
      });
    }
  }, [pendingQuery.isError, t, toast]);

  const approveMutation = trpc.users.approve.useMutation();
  const rejectMutation = trpc.users.reject.useMutation();

  const dateFormatter = new Intl.DateTimeFormat(locale === 'kk' ? 'kk-KZ' : 'ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  const handleApprove = async (user: SerializedUser) => {
    setBusyId(user.id);
    try {
      await approveMutation.mutateAsync(user.id);
      await utils.users.pending.invalidate();
      await utils.users.list.invalidate();
      toast({
        title: t('toast.approvedTitle'),
        description: t('toast.approvedDescription', {
          name: user.fullName ?? user.name,
        }),
      });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('toast.errorTitle'),
        description: e instanceof Error ? e.message : t('toast.loadFailed'),
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (user: SerializedUser) => {
    setBusyId(user.id);
    try {
      await rejectMutation.mutateAsync(user.id);
      await utils.users.pending.invalidate();
      await utils.users.list.invalidate();
      toast({
        title: t('toast.rejectedTitle'),
        description: t('toast.rejectedDescription', {
          name: user.fullName ?? user.name,
        }),
      });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('toast.errorTitle'),
        description: e instanceof Error ? e.message : t('toast.loadFailed'),
      });
    } finally {
      setBusyId(null);
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
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            <h1 className="text-2xl md:text-3xl font-bold text-primary font-headline">
              {t('title')}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </header>

        {pending === null ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : pending.length === 0 ? (
          <Card className="bg-muted/30">
            <CardContent className="p-8 text-center text-muted-foreground">
              {t('empty')}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {pending.map((user) => (
              <Card key={user.id} className="border-amber-500/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{user.fullName ?? user.name}</CardTitle>
                  <CardDescription className="break-all">{user.email}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Field label={t('tableSpecialty')} value={user.specialty} />
                  <Field label={t('tableRegion')} value={user.region} />
                  <Field label={t('tablePhone')} value={user.phoneNumber} />
                  <Field
                    label={t('tableCreatedAt')}
                    value={dateFormatter.format(new Date(user.createdAt))}
                  />

                  <div className="flex flex-wrap gap-2 pt-3">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          size="sm"
                          disabled={busyId === user.id}
                          className="gap-1.5"
                        >
                          {busyId === user.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          {t('approveButton')}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('approveConfirmTitle')}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('approveConfirmDescription')}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('confirmNo')}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleApprove(user)}>
                            {t('confirmYes')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busyId === user.id}
                          className="gap-1.5 text-destructive hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                          {t('rejectButton')}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('rejectConfirmTitle')}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('rejectConfirmDescription')}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('confirmNo')}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleReject(user)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {t('confirmYes')}
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

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-right text-foreground/90">{value ?? '—'}</span>
    </div>
  );
}
