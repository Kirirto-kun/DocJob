import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { AppProviders } from '@/components/app-providers';
import { NoCopyRoot } from '@/components/no-copy-root';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common');
  return {
    title: t('appTitle'),
    description: t('appTagline'),
    icons: {
      icon: [{ url: '/favicon.ico?v=20260602', sizes: 'any' }],
      shortcut: ['/favicon.ico?v=20260602'],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <NoCopyRoot>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <AppProviders>
              {children}
              <Toaster />
            </AppProviders>
          </NextIntlClientProvider>
        </NoCopyRoot>
      </body>
    </html>
  );
}
