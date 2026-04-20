import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { AppProviders } from '@/components/app-providers';
import { NoCopyRoot } from '@/components/no-copy-root';
import { Analytics } from "@vercel/analytics/next"

export const metadata: Metadata = {
  title: 'Medizo AI — Платформа учебных кейсов',
  description: 'Обучающая платформа с клиническими кейсами, чат-ботом и разбором врачебных ситуаций.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <NoCopyRoot>
          <AppProviders>
            {children}
            <Toaster />
          </AppProviders>
        </NoCopyRoot>
      </body>
    </html>
  );
}
