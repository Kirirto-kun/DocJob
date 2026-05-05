'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import DashboardLayout from '@/components/dashboard-layout';
import { useUserStore } from '@/hooks/use-user-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { FileText, Loader2, MapPin, Phone, Mail, Clock, ShieldCheck } from 'lucide-react';

export default function ContactsPage() {
  const { currentUser, isInitialized } = useUserStore();
  const router = useRouter();
  const t = useTranslations('user.contacts');

  useEffect(() => {
    if (isInitialized && !currentUser) {
      router.push('/login');
    }
  }, [currentUser, isInitialized, router]);

  if (!isInitialized || !currentUser) {
    return (
      <DashboardLayout sidebarContent={null}>
        <main className="flex h-screen w-full items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </main>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout sidebarContent={null}>
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
        <header>
          <h1 className="text-2xl md:text-3xl font-bold text-primary font-headline">
            {t('title')}
          </h1>
        </header>

        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>{t('orgTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-muted-foreground">{t('addressLabel')}</p>
                <p>{t('addressValue')}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-muted-foreground">{t('phoneLabel')}</p>
                <a href="tel:+74950000000" className="hover:underline">
                  {t('phoneValue')}
                </a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-muted-foreground">{t('emailLabel')}</p>
                <a href="mailto:info@docjob.local" className="hover:underline">
                  {t('emailValue')}
                </a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-muted-foreground">{t('hoursLabel')}</p>
                <p>{t('hoursValue')}</p>
              </div>
            </div>
            <Separator />
            <p className="text-sm text-muted-foreground">{t('feedback')}</p>
          </CardContent>
        </Card>

        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="text-base">{t('legalCardTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link
              href="/legal/terms"
              className="flex items-start gap-3 rounded-md border border-border/50 bg-muted/15 px-4 py-3 transition-colors hover:border-primary/40"
            >
              <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium">{t('legal.termsTitle')}</p>
                <p className="text-xs text-muted-foreground">{t('legal.termsDesc')}</p>
              </div>
            </Link>
            <Link
              href="/legal/privacy"
              className="flex items-start gap-3 rounded-md border border-border/50 bg-muted/15 px-4 py-3 transition-colors hover:border-primary/40"
            >
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium">{t('legal.privacyTitle')}</p>
                <p className="text-xs text-muted-foreground">{t('legal.privacyDesc')}</p>
              </div>
            </Link>
          </CardContent>
        </Card>
      </main>
    </DashboardLayout>
  );
}
