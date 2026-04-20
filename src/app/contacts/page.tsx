'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/dashboard-layout';
import { useUserStore } from '@/hooks/use-user-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2, MapPin, Phone, Mail, Clock } from 'lucide-react';

export default function ContactsPage() {
  const { currentUser, isInitialized } = useUserStore();
  const router = useRouter();

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
            Контакты
          </h1>
        </header>

        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>ООО «Медизо АИ»</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-muted-foreground">Адрес</p>
                <p>г. Москва, ул. Примерная, д. 1, оф. 101</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-muted-foreground">Телефон</p>
                <a href="tel:+74950000000" className="hover:underline">
                  +7 (495) 000-00-00
                </a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <a href="mailto:info@medizo.local" className="hover:underline">
                  info@medizo.local
                </a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-muted-foreground">Часы работы</p>
                <p>Пн–Пт 09:00–18:00 (МСК)</p>
              </div>
            </div>
            <Separator />
            <p className="text-sm text-muted-foreground">
              Если у вас есть предложения по улучшению платформы, напишите нам через раздел Техподдержка.
            </p>
          </CardContent>
        </Card>
      </main>
    </DashboardLayout>
  );
}
