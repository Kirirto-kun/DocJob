'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { useToast } from '@/hooks/use-toast';
import { DocJobLogo } from '@/components/icons';
import { Loader2 } from 'lucide-react';
import { checkResetToken, resetPassword } from '@/app/actions';

const schema = z
  .object({
    newPassword: z.string().min(6, 'Минимум 6 символов'),
    confirm: z.string().min(1, 'Повторите пароль'),
  })
  .refine((d) => d.newPassword === d.confirm, {
    path: ['confirm'],
    message: 'Пароли не совпадают',
  });
type Values = z.infer<typeof schema>;

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const token = searchParams.get('token') ?? '';
  const [status, setStatus] = useState<'checking' | 'valid' | 'invalid'>('checking');
  const [isLoading, setIsLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    let active = true;
    checkResetToken(token).then((res) => {
      if (active) setStatus(res.valid ? 'valid' : 'invalid');
    });
    return () => {
      active = false;
    };
  }, [token]);

  const onSubmit = async (data: Values) => {
    setIsLoading(true);
    const res = await resetPassword({ token, newPassword: data.newPassword });
    setIsLoading(false);
    if (res.success) {
      toast({ title: 'Пароль изменён', description: 'Войдите с новым паролем.' });
      router.push('/login');
    } else {
      toast({ variant: 'destructive', title: 'Не удалось', description: res.error });
      setStatus('invalid');
    }
  };

  if (status === 'checking') {
    return <div className="text-center text-sm text-muted-foreground">Проверяем ссылку…</div>;
  }
  if (status === 'invalid') {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Ссылка устарела или недействительна.
        </div>
        <Button asChild className="w-full">
          <Link href="/forgot-password">Запросить новую ссылку</Link>
        </Button>
      </div>
    );
  }
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="newPassword">Новый пароль</Label>
        <PasswordInput id="newPassword" {...register('newPassword')} />
        {errors.newPassword && <p className="text-sm text-destructive">{errors.newPassword.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Повторите пароль</Label>
        <PasswordInput id="confirm" {...register('confirm')} />
        {errors.confirm && <p className="text-sm text-destructive">{errors.confirm.message}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Сохранить пароль
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="relative flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <DocJobLogo className="h-16 w-16" />
          </div>
          <CardTitle className="text-2xl font-headline">Новый пароль</CardTitle>
          <CardDescription>Задайте новый пароль для входа.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="text-center text-sm text-muted-foreground">Загрузка…</div>}>
            <ResetForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
