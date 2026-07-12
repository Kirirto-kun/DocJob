'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslations } from 'next-intl';
import { AlertCircle, Bot, CheckCircle2, Loader2, RotateCcw, Send, User } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { DiagnosisSubmitDialog } from '@/components/diagnosis-submit-dialog';
import { SolutionPanel } from '@/components/solution-panel';
import { SuggestedActionsChips } from '@/components/suggested-actions-chips';
import { useCaseChat } from '@/hooks/use-case-chat';
import { cn } from '@/lib/utils';
import type { CaseSolution, ChatHistoryMessage, ChatPhase } from '@/lib/case-schema';

export type CaseChatViewProps = {
  caseId: string;
  caseName: string;
  solution?: CaseSolution | null;
  className?: string;
};

const PHASE_KEYS: { key: ChatPhase; tKey: 'discussing' | 'diagnosisSubmitted' | 'done' }[] = [
  { key: 'discussing', tKey: 'discussing' },
  { key: 'diagnosis_submitted', tKey: 'diagnosisSubmitted' },
  { key: 'done', tKey: 'done' },
];

const markdownComponents = {
  p: ({ ...props }) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
  ul: ({ ...props }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0" {...props} />,
  ol: ({ ...props }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0" {...props} />,
  strong: ({ ...props }) => <strong className="font-semibold text-foreground" {...props} />,
  em: ({ ...props }) => <em className="italic text-foreground/90" {...props} />,
  a: ({ ...props }) => (
    <a
      className="text-primary underline-offset-2 hover:underline"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  code: ({ ...props }) => (
    <code className="rounded bg-background/60 px-1 py-0.5 text-[0.85em]" {...props} />
  ),
  pre: ({ ...props }) => (
    <pre className="my-2 overflow-x-auto rounded-md bg-background/60 p-2 text-xs" {...props} />
  ),
  table: ({ ...props }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs" {...props} />
    </div>
  ),
  th: ({ ...props }) => (
    <th className="border border-border px-2 py-1 text-left font-semibold" {...props} />
  ),
  td: ({ ...props }) => <td className="border border-border px-2 py-1 align-top" {...props} />,
};

function PhaseIndicator({ phase }: { phase: ChatPhase }) {
  const t = useTranslations('case.chat.phase');
  const activeIndex = PHASE_KEYS.findIndex((p) => p.key === phase);
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {PHASE_KEYS.map((p, idx) => {
        const isActive = idx === activeIndex;
        const isDone = idx < activeIndex;
        return (
          <div key={p.key} className="flex items-center gap-1.5">
            <span
              className={cn(
                'rounded-full border px-2.5 py-0.5 font-medium transition-colors',
                isActive && 'border-primary/60 bg-primary/15 text-primary',
                isDone && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
                !isActive && !isDone && 'border-border/60 bg-muted/30 text-muted-foreground',
              )}
            >
              {t(p.tKey)}
            </span>
            {idx < PHASE_KEYS.length - 1 ? (
              <span
                className={cn(
                  'h-px w-4 transition-colors',
                  idx < activeIndex ? 'bg-emerald-500/40' : 'bg-border/60',
                )}
                aria-hidden
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70" />
    </div>
  );
}

function MessageBubble({ message }: { message: ChatHistoryMessage }) {
  const t = useTranslations('case.chat');
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex gap-2.5', isUser && 'flex-row-reverse')}>
      <Avatar
        className={cn(
          'h-8 w-8 shrink-0 border',
          isUser ? 'border-primary/40 bg-primary/15' : 'border-border/60 bg-muted/40',
        )}
      >
        <AvatarFallback className="bg-transparent">
          {isUser ? (
            <User className="h-4 w-4 text-primary" />
          ) : (
            <Bot className="h-4 w-4 text-foreground/80" />
          )}
        </AvatarFallback>
      </Avatar>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl border px-3.5 py-2.5 text-sm shadow-sm',
          'animate-in fade-in slide-in-from-bottom-1',
          isUser
            ? 'border-primary/40 bg-primary/15 text-foreground rounded-tr-sm'
            : 'border-border/60 bg-muted/30 text-foreground/95 rounded-tl-sm',
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {message.content}
          </ReactMarkdown>
        )}
        {message.isFinalAnswer ? (
          <div className="mt-2 flex items-center gap-1 text-[10px] uppercase tracking-wide text-primary/80">
            <CheckCircle2 className="h-3 w-3" />
            {t('finalAnswerBadge')}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PendingAssistantBubble() {
  return (
    <div className="flex gap-2.5">
      <Avatar className="h-8 w-8 shrink-0 border border-border/60 bg-muted/40">
        <AvatarFallback className="bg-transparent">
          <Bot className="h-4 w-4 text-foreground/80" />
        </AvatarFallback>
      </Avatar>
      <div className="rounded-2xl rounded-tl-sm border border-border/60 bg-muted/30 px-3.5 py-2.5">
        <TypingIndicator />
      </div>
    </div>
  );
}

export function CaseChatView({ caseId, caseName, solution, className }: CaseChatViewProps) {
  const chat = useCaseChat(caseId);
  const t = useTranslations('case.chat');
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat.messages.length, chat.isLoading, chat.phase]);

  const trimmedDraft = draft.trim();
  const canSend = trimmedDraft.length > 0 && !chat.isLoading && !chat.isInitializing;

  const onSend = async () => {
    if (!canSend) return;
    const text = trimmedDraft;
    setDraft('');
    await chat.sendMessage(text);
  };

  const onPickAction = async (label: string) => {
    if (chat.isLoading || chat.isInitializing) return;
    await chat.sendMessage(label);
  };

  const lastAssistantWithActions = [...chat.messages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.suggestedActions && m.suggestedActions.length > 0);
  const lastSuggested = lastAssistantWithActions?.suggestedActions ?? [];

  const lastMessage = chat.messages.at(-1);
  const showPendingAssistant = chat.isLoading && lastMessage?.role === 'user';

  const isDone = chat.phase === 'done';

  return (
    <div
      className={cn(
        className ?? 'flex h-full min-h-0 flex-col gap-3',
        isDone && 'overflow-y-auto pr-1',
      )}
    >
      <Card
        className={cn(
          'flex flex-col overflow-hidden',
          isDone ? 'shrink-0' : 'h-full min-h-0 flex-1',
        )}
      >
        <CardHeader className="flex shrink-0 flex-row items-center justify-between gap-3 space-y-0 border-b border-border/40 px-4 py-2.5">
          <CardTitle className="truncate text-sm font-semibold">{t('title')}</CardTitle>
          <PhaseIndicator phase={chat.phase} />
        </CardHeader>

        <CardContent className="flex flex-1 min-h-0 flex-col overflow-hidden p-0">
          <ScrollArea className="flex-1 min-h-0 px-4 py-3">
            {chat.isInitializing ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('preparing')}
              </div>
            ) : chat.messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
                <Bot className="h-8 w-8 text-muted-foreground/60" />
                <p>{t('greeting')}</p>
              </div>
            ) : (
              <div className="space-y-4 pb-2">
                {chat.messages.map((m, i) => (
                  <MessageBubble key={`${m.createdAt}-${i}`} message={m} />
                ))}
                {showPendingAssistant ? <PendingAssistantBubble /> : null}
                <div ref={bottomRef} />
              </div>
            )}
          </ScrollArea>

          <div className="shrink-0 space-y-2 border-t border-border/40 bg-background/40 px-3 py-3">
            {chat.error ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{chat.error}</p>
              </div>
            ) : null}

            {!isDone && lastSuggested.length > 0 ? (
              <SuggestedActionsChips
                actions={lastSuggested}
                onPick={(a) => onPickAction(a.label)}
                disabled={chat.isLoading || chat.isInitializing}
              />
            ) : null}

            {isDone ? (
              <Button
                type="button"
                variant="outline"
                onClick={chat.reset}
                disabled={chat.isLoading}
                className="w-full gap-2"
              >
                {chat.isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                {t('replay')}
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-end gap-2 rounded-2xl border border-border/60 bg-background/80 px-2 py-1.5 shadow-sm focus-within:border-primary/60">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void onSend();
                      }
                    }}
                    rows={1}
                    placeholder={t('placeholder')}
                    disabled={chat.isLoading || chat.isInitializing}
                    className="min-h-[40px] max-h-40 flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-sm shadow-none focus-visible:ring-0"
                  />
                  <Button
                    type="button"
                    size="icon"
                    onClick={onSend}
                    disabled={!canSend}
                    aria-label={t('send')}
                    className="h-9 w-9 shrink-0 rounded-full"
                  >
                    {chat.isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="hidden sm:inline">{t('enterHint')}</span>
                  <DiagnosisSubmitDialog
                    trigger={
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="ml-auto whitespace-nowrap"
                        disabled={chat.isLoading || chat.isInitializing}
                      >
                        <CheckCircle2 className="mr-1.5 h-4 w-4" />
                        {t('finalAnswer')}
                      </Button>
                    }
                    disabled={chat.isLoading || chat.isInitializing}
                    onSubmit={(answer) => chat.submitFinalAnswer(answer)}
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      {isDone ? <SolutionPanel evaluation={chat.evaluation} solution={solution ?? null} /> : null}
    </div>
  );
}

export default CaseChatView;
