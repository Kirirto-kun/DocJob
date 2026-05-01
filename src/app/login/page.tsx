'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { DocJobLogo } from '@/components/icons';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Loader2 } from 'lucide-react';
import { signInWithCredentials } from '@/hooks/use-user-store';

const loginSchema = z.object({
  email: z.string().email('Введите корректный email'),
  password: z.string().min(1, 'Введите пароль'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    const res = await signInWithCredentials(data.email, data.password);
    setIsLoading(false);

    if (res.ok) {
      toast({ title: 'Вход выполнен', description: 'Добро пожаловать в DocJob!' });
      router.push(searchParams.get('callbackUrl') ?? '/');
      router.refresh();
    } else {
      toast({
        variant: 'destructive',
        title: 'Ошибка входа',
        description: res.error ?? 'Неверный email или пароль.',
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" placeholder="you@example.com" {...register('email')} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Пароль</Label>
        <Input id="password" type="password" {...register('password')} />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Войти
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="relative flex items-center justify-center min-h-screen bg-background">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher variant="outline" />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <DocJobLogo className="h-16 w-16" />
          </div>
          <CardTitle className="text-2xl font-headline">Вход в DocJob</CardTitle>
          <CardDescription>Введите email и пароль, чтобы продолжить</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="text-center text-sm text-muted-foreground">Загрузка…</div>}>
            <LoginForm />
          </Suspense>
          <div className="mt-4 text-center text-sm">
            <span className="text-muted-foreground">Нет аккаунта? </span>
            <Link href="/register" className="text-primary hover:underline">
              Зарегистрироваться
            </Link>
          </div>
          <p className="text-xs text-center text-muted-foreground mt-4">
            Для демо используйте admin@docjob.local / password123
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <Link href="/legal/terms" className="hover:underline">
              Пользовательское соглашение
            </Link>
            <span aria-hidden>·</span>
            <Link href="/legal/privacy" className="hover:underline">
              Политика конфиденциальности
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
