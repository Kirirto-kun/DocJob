'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { DocJobLogo } from '@/components/icons';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Loader2 } from 'lucide-react';
import { signInWithCredentials } from '@/hooks/use-user-store';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const t = useTranslations('auth.login');
  const [isLoading, setIsLoading] = useState(false);
  const justRegistered = searchParams.get('pending') === '1';

  const loginSchema = z.object({
    email: z.string().email(t('errors.emailInvalid')),
    password: z.string().min(1, t('errors.passwordRequired')),
  });
  type LoginFormValues = z.infer<typeof loginSchema>;

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
      toast({ title: t('toast.successTitle'), description: t('toast.successDescription') });
      router.push(searchParams.get('callbackUrl') ?? '/');
      router.refresh();
    } else {
      const isPending = res.reason === 'pending';
      toast({
        variant: 'destructive',
        title: isPending ? t('toast.pendingTitle') : t('toast.failTitle'),
        description: isPending
          ? t('toast.pendingDescription')
          : (res.error ?? t('toast.failDescription')),
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {justRegistered ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
          <p className="font-medium">{t('pendingBanner.title')}</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-200/85">
            {t('pendingBanner.body')}
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">{t('emailLabel')}</Label>
        <Input id="email" type="email" placeholder={t('emailPlaceholder')} {...register('email')} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t('passwordLabel')}</Label>
        <Input id="password" type="password" {...register('password')} />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {t('submit')}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  const t = useTranslations('auth.login');
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
          <CardTitle className="text-2xl font-headline">{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="text-center text-sm text-muted-foreground">{t('loading')}</div>}>
            <LoginForm />
          </Suspense>
          <div className="mt-4 text-center text-sm">
            <span className="text-muted-foreground">{t('noAccount')} </span>
            <Link href="/register" className="text-primary hover:underline">
              {t('registerCta')}
            </Link>
          </div>
          <p className="text-xs text-center text-muted-foreground mt-4">
            {t('demoHint')}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <Link href="/legal/terms" className="hover:underline">
              {t('legal.terms')}
            </Link>
            <span aria-hidden>·</span>
            <Link href="/legal/privacy" className="hover:underline">
              {t('legal.privacy')}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
