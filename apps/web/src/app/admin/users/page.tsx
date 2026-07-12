'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Loader2, Trash2, Users as UsersIcon } from 'lucide-react';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { getUsers, deleteUser, type SerializedUser } from '@/app/actions';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Администратор',
  REVIEWER: 'Рецензент',
  DOCTOR: 'Врач',
  PATIENT: 'Пациент',
};

export default function AdminUsersPage() {
  const { currentUser, isInitialized } = useUserStore();
  const router = useRouter();
  const { toast } = useToast();
  const locale = useLocale();

  const [users, setUsers] = useState<SerializedUser[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!isInitialized) return;
    if (!currentUser) {
      router.push('/login');
      return;
    }
    if (currentUser.role !== 'admin') {
      toast({
        variant: 'destructive',
        title: 'Нет доступа',
        description: 'Управлять пользователями может только администратор.',
      });
      router.push('/');
    }
  }, [currentUser, isInitialized, router, toast]);

  useEffect(() => {
    if (!isInitialized || !currentUser || currentUser.role !== 'admin') return;
    let cancelled = false;
    (async () => {
      const res = await getUsers();
      if (cancelled) return;
      if (res.success) {
        setUsers(res.data);
      } else {
        setUsers([]);
        toast({ variant: 'destructive', title: 'Ошибка', description: res.error });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isInitialized, currentUser, toast]);

  const dateFormatter = new Intl.DateTimeFormat(locale === 'kk' ? 'kk-KZ' : 'ru-RU', {
    dateStyle: 'short',
  });

  const onDelete = async (user: SerializedUser) => {
    setBusyId(user.id);
    const res = await deleteUser(user.id);
    setBusyId(null);
    if (res.success) {
      setUsers((prev) => prev?.filter((u) => u.id !== user.id) ?? null);
      toast({
        title: 'Пользователь удалён',
        description: `${user.fullName ?? user.name} (${user.email}) больше не имеет доступа к платформе.`,
      });
    } else {
      toast({ variant: 'destructive', title: 'Ошибка', description: res.error });
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
            <UsersIcon className="h-5 w-5 text-primary" />
            <h1 className="text-2xl md:text-3xl font-bold text-primary font-headline">
              Пользователи
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Все зарегистрированные пользователи. Удаление полностью отбирает доступ к платформе.
          </p>
        </header>

        {users === null ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <Card className="bg-muted/30">
            <CardContent className="p-8 text-center text-muted-foreground">
              Пользователей пока нет.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {users.map((user) => {
              const isSelf = user.id === currentUser.id;
              return (
                <Card key={user.id}>
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">
                          {user.fullName ?? user.name}
                        </span>
                        <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>
                          {ROLE_LABELS[user.role] ?? user.role}
                        </Badge>
                        {!user.approvedAt && (
                          <Badge variant="outline" className="text-amber-400">
                            не одобрен
                          </Badge>
                        )}
                        {isSelf && (
                          <Badge variant="outline" className="text-primary">
                            это вы
                          </Badge>
                        )}
                      </div>
                      <p className="break-all text-sm text-muted-foreground">{user.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {user.specialty ? `${user.specialty} · ` : ''}
                        регистрация {dateFormatter.format(new Date(user.createdAt))}
                      </p>
                    </div>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isSelf || busyId === user.id}
                          className="shrink-0 gap-1.5 text-destructive hover:text-destructive"
                        >
                          {busyId === user.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          Удалить
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Удалить пользователя?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {user.fullName ?? user.name} ({user.email}) будет удалён безвозвратно и
                            потеряет доступ к платформе. Связанные данные (кейсы, сессии, отзывы,
                            заявки) также будут удалены. Это действие нельзя отменить.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Отмена</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => onDelete(user)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Удалить
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </DashboardLayout>
  );
}
