'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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

const PHASES: { key: ChatPhase; label: string }[] = [
  { key: 'discussing', label: 'Обсуждение' },
  { key: 'diagnosis_submitted', label: 'Финальный ответ' },
  { key: 'done', label: 'Разбор' },
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
  const activeIndex = PHASES.findIndex((p) => p.key === phase);
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {PHASES.map((p, idx) => {
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
              {p.label}
            </span>
            {idx < PHASES.length - 1 ? (
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
            Финальный ответ
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
    <div className={className ?? 'flex h-full flex-col gap-4'}>
      <Card className="flex h-full min-h-0 flex-col">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 border-b border-border/40 pb-3">
          <div className="space-y-1">
            <CardTitle className="text-base">Чат-наставник по кейсу «{caseName}»</CardTitle>
            <p className="text-xs text-muted-foreground">
              Обсудите кейс, задайте вопросы, затем сформулируйте финальный ответ.
            </p>
          </div>
          <PhaseIndicator phase={chat.phase} />
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
          <ScrollArea className="flex-1 pr-3">
            {chat.isInitializing ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Готовим чат…
              </div>
            ) : chat.messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
                <Bot className="h-8 w-8 text-muted-foreground/60" />
                <p>Наставник готов к диалогу. Задайте первый вопрос по кейсу.</p>
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
              className="gap-2"
            >
              {chat.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Пройти кейс заново
            </Button>
          ) : (
            <div className="flex items-end gap-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void onSend();
                  }
                }}
                rows={2}
                placeholder="Сообщение наставнику…"
                disabled={chat.isLoading || chat.isInitializing}
                className="min-h-[44px] resize-none"
              />
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  onClick={onSend}
                  disabled={!canSend}
                  aria-label="Отправить"
                >
                  {chat.isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
                <DiagnosisSubmitDialog
                  trigger={
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="whitespace-nowrap"
                      disabled={chat.isLoading || chat.isInitializing}
                    >
                      <CheckCircle2 className="mr-1.5 h-4 w-4" />
                      Финальный ответ
                    </Button>
                  }
                  disabled={chat.isLoading || chat.isInitializing}
                  onSubmit={(answer) => chat.submitFinalAnswer(answer)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {isDone ? <SolutionPanel evaluation={chat.evaluation} solution={solution ?? null} /> : null}
    </div>
  );
}

export default CaseChatView;
