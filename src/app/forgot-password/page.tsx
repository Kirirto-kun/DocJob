'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DocJobLogo } from '@/components/icons';
import { Loader2 } from 'lucide-react';
import { requestPasswordReset } from '@/app/actions';

const schema = z.object({ email: z.string().email('Введите корректный email') });
type Values = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: Values) => {
    setIsLoading(true);
    await requestPasswordReset(data.email);
    setIsLoading(false);
    setSubmitted(true);
  };

  return (
    <div className="relative flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <DocJobLogo className="h-16 w-16" />
          </div>
          <CardTitle className="text-2xl font-headline">Восстановление пароля</CardTitle>
          <CardDescription>Укажите email — пришлём ссылку для сброса пароля.</CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              Если этот email зарегистрирован, мы отправили на него ссылку для сброса пароля.
              Проверьте почту (и папку «Спам»).
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@example.com" {...register('email')} />
                {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Отправить ссылку
              </Button>
            </form>
          )}
          <div className="mt-4 text-center text-sm">
            <Link href="/login" className="text-primary hover:underline">
              Вернуться ко входу
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
