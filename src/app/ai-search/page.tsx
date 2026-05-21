'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, Search, Sparkles, User as UserIcon } from 'lucide-react';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useUserStore } from '@/hooks/use-user-store';
import { cn } from '@/lib/utils';

type ChatTurn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string };

export default function AiSearchPage() {
  const { currentUser, isInitialized } = useUserStore();
  const router = useRouter();
  const t = useTranslations('aiSearch');
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isInitialized) return;
    if (!currentUser) router.push('/login');
  }, [isInitialized, currentUser, router]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [history]);

  const onSend = async () => {
    const text = draft.trim();
    if (!text || pending) return;
    setDraft('');
    setPending(true);
    setHistory((prev) => [...prev, { role: 'user', text }]);
    await new Promise((r) => setTimeout(r, 700));
    setHistory((prev) => [...prev, { role: 'assistant', text: t('stubResponse') }]);
    setPending(false);
  };

  return (
    <DashboardLayout sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}>
      <main className="flex h-full min-h-0 flex-1 flex-col p-4 md:p-6 lg:p-8">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col gap-4">
          <div>
            <h1 className="font-headline text-3xl font-semibold">{t('title')}</h1>
            <p className="mt-1 text-muted-foreground">{t('description')}</p>
          </div>

          <Alert>
            <Sparkles className="h-4 w-4" />
            <AlertTitle>{t('comingSoon')}</AlertTitle>
            <AlertDescription>{t('comingSoonHint')}</AlertDescription>
          </Alert>

          <Card className="flex flex-1 flex-col overflow-hidden">
            <div
              ref={scrollRef}
              className="flex-1 space-y-4 overflow-y-auto p-4"
            >
              {history.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                  <Search className="h-10 w-10" />
                  <p className="max-w-md text-sm">{t('description')}</p>
                </div>
              ) : (
                history.map((turn, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex gap-3',
                      turn.role === 'user' ? 'justify-end' : 'justify-start',
                    )}
                  >
                    {turn.role === 'assistant' && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                        <Sparkles className="h-4 w-4" />
                      </div>
                    )}
                    <div
                      className={cn(
                        'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm',
                        turn.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground',
                      )}
                    >
                      {turn.text}
                    </div>
                    {turn.role === 'user' && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                        <UserIcon className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                ))
              )}
              {pending ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">…</span>
                </div>
              ) : null}
            </div>

            <CardContent className="border-t bg-card/60 p-3">
              <div className="flex items-end gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t('placeholder')}
                  rows={2}
                  className="resize-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void onSend();
                    }
                  }}
                />
                <Button onClick={onSend} disabled={pending || draft.trim().length === 0}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('send')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </DashboardLayout>
  );
}
