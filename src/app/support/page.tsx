'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import { useUserStore } from '@/hooks/use-user-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail } from 'lucide-react';

export default function SupportPage() {
  const { currentUser, isInitialized } = useUserStore();
  const { toast } = useToast();
  const router = useRouter();
  const t = useTranslations('user.support');

  useEffect(() => {
    if (isInitialized && !currentUser) {
      router.push('/login');
    }
  }, [currentUser, router, isInitialized]);

  const supportSchema = useMemo(
    () =>
      z.object({
        subject: z.string().min(1, t('errors.subjectRequired')),
        message: z.string().min(10, t('errors.messageMin')),
      }),
    [t],
  );
  type SupportFormValues = z.infer<typeof supportSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SupportFormValues>({
    resolver: zodResolver(supportSchema),
  });

  if (!isInitialized || !currentUser) {
    return (
      <DashboardLayout sidebarContent={null}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const senderName = currentUser.fullName ?? currentUser.name;
  const senderPhone = currentUser.phoneNumber ?? t('phoneFallback');

  const onSubmit: SubmitHandler<SupportFormValues> = (data) => {
    const body = `${data.message}\n\n---\n${t('mailSenderLabel')}: ${senderName}\n${t('mailEmailLabel')}: ${currentUser.email}\n${t('mailPhoneLabel')}: ${senderPhone}`;
    const mailtoUrl = `mailto:support@docjob.local?subject=${encodeURIComponent(data.subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
    toast({ title: t('sentToast') });
  };

  return (
    <DashboardLayout sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}>
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold text-primary font-headline">{t('title')}</h1>
        </header>
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>{t('cardTitle')}</CardTitle>
            <CardDescription>{t('cardDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Label htmlFor="subject">{t('subjectLabel')}</Label>
                <Input id="subject" {...register('subject')} />
                {errors.subject && <p className="text-destructive text-sm mt-1">{errors.subject.message}</p>}
              </div>
              <div>
                <Label htmlFor="message">{t('messageLabel')}</Label>
                <Textarea id="message" rows={6} {...register('message')} />
                {errors.message && <p className="text-destructive text-sm mt-1">{errors.message.message}</p>}
              </div>

              <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">{t('infoTitle')}</p>
                <p>{t('infoEmail', { email: currentUser.email })}</p>
                <p>{t('infoPhone', { phone: senderPhone })}</p>
                <p>{t('infoName', { name: senderName })}</p>
              </div>

              <Button type="submit" className="w-full">
                <Mail className="mr-2 h-4 w-4" />
                {t('submit')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </DashboardLayout>
  );
}
