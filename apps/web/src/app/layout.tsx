import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import './globals.css';
import NextTopLoader from 'nextjs-toploader';
import { Toaster } from '@/components/ui/toaster';
import { AppProviders } from '@/components/app-providers';
import { NoCopyRoot } from '@/components/no-copy-root';
import { SEO_KEYWORDS, SITE_NAME, SITE_URL } from '@/lib/site';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common');
  const title = t('appTitle');
  const description = t('appTagline');

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    applicationName: SITE_NAME,
    keywords: [...SEO_KEYWORDS],
    alternates: { canonical: '/' },
    icons: {
      icon: [{ url: '/favicon.ico?v=20260602', sizes: 'any' }],
      shortcut: ['/favicon.ico?v=20260602'],
    },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: 'ru_RU',
      url: SITE_URL,
      title,
      description,
      images: [{ url: '/logo_dj.jpg', alt: SITE_NAME }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/logo_dj.jpg'],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
    },
    verification: {
      google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
      yandex: process.env.YANDEX_VERIFICATION || undefined,
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
        {/* Global navigation progress bar — immediate "page is opening" feedback
            on every route change (Link AND router.push, which the sidebar uses),
            app-wide, in dev and prod. Cyan matches the theme's --primary. */}
        <NextTopLoader
          color="#22d3ee"
          height={3}
          shadow="0 0 10px #22d3ee, 0 0 5px #22d3ee"
          showSpinner={true}
          zIndex={2000}
        />
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
