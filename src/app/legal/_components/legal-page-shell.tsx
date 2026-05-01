import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { DocJobLogo } from '@/components/icons';
import { LanguageSwitcher } from '@/components/language-switcher';

type LegalPageShellProps = {
  title: string;
  subtitle?: string;
  lastUpdated?: string;
  children: React.ReactNode;
};

export function LegalPageShell({ title, subtitle, lastUpdated, children }: LegalPageShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <Link href="/landing" className="flex items-center gap-3">
            <DocJobLogo className="h-7 w-7 text-primary" />
            <span className="font-headline text-base font-semibold text-primary">DocJob</span>
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button asChild variant="ghost" size="sm">
              <Link href="/landing">
                <ArrowLeft className="mr-1 h-4 w-4" />
                На главную
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10 md:py-14">
        <div className="space-y-3">
          <h1 className="font-headline text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
          {subtitle ? (
            <p className="text-base leading-relaxed text-muted-foreground">{subtitle}</p>
          ) : null}
          {lastUpdated ? (
            <p className="text-xs uppercase tracking-wide text-muted-foreground/70">
              Редакция от {lastUpdated}
            </p>
          ) : null}
        </div>

        <Separator className="my-6 opacity-50" />

        <article className="legal-content space-y-6 text-[0.95rem] leading-relaxed text-foreground/90">
          {children}
        </article>

        <Separator className="my-10 opacity-30" />

        <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <DocJobLogo className="h-5 w-5 text-primary" />
            <span>DocJob</span>
            <span className="text-muted-foreground/70">© {new Date().getFullYear()}</span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/legal/privacy" className="transition-colors hover:text-foreground">
              Политика конфиденциальности
            </Link>
            <Link href="/legal/terms" className="transition-colors hover:text-foreground">
              Пользовательское соглашение
            </Link>
            <Link href="/landing#contacts" className="transition-colors hover:text-foreground">
              Контакты
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

export default LegalPageShell;
