'use client';

import { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Bot, Loader2, Send, User } from 'lucide-react';
import { DiagnosisSubmitDialog } from '@/components/diagnosis-submit-dialog';
import { SuggestedActionsChips } from '@/components/suggested-actions-chips';
import { SolutionPanel } from '@/components/solution-panel';
import { useCaseChat } from '@/hooks/use-case-chat';
import type { CaseSolution } from '@/lib/case-schema';

export type CaseChatViewProps = {
  caseId: string;
  caseName: string;
  // solution прокидывается ТОЛЬКО когда фаза done и админ/студент уже заслужил разбор
  solution?: CaseSolution | null;
  className?: string;
};

// STUB — заменяется в Волне 2 (Unit U2) на улучшенный чат с phase-индикатором,
// markdown-рендером, аватарами и анимациями.
export function CaseChatView({ caseId, caseName, solution, className }: CaseChatViewProps) {
  const chat = useCaseChat(caseId);
  const [draft, setDraft] = useState('');

  const onSend = async () => {
    if (!draft.trim() || chat.isLoading) return;
    const text = draft;
    setDraft('');
    await chat.sendMessage(text);
  };

  const onPickAction = async (label: string) => {
    if (chat.isLoading) return;
    setDraft('');
    await chat.sendMessage(label);
  };

  const lastSuggested =
    [...chat.messages].reverse().find((m) => m.role === 'assistant')?.suggestedActions ?? [];

  return (
    <div className={className ?? 'flex h-full flex-col gap-4'}>
      <Card className="flex h-full flex-col">
        <CardHeader>
          <CardTitle className="text-base">Чат-наставник по кейсу «{caseName}»</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3 overflow-hidden">
          <ScrollArea className="flex-1 pr-3">
            {chat.isInitializing ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Готовим чат…
              </div>
            ) : (
              <div className="space-y-3">
                {chat.messages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex gap-2 text-sm ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        {m.role === 'assistant' ? (
                          <Bot className="h-4 w-4" />
                        ) : (
                          <User className="h-4 w-4" />
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className={`max-w-[80%] rounded-md border px-3 py-2 ${
                        m.role === 'assistant' ? 'bg-muted/40' : 'bg-primary/10 border-primary/30'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      {m.isFinalAnswer ? (
                        <p className="mt-1 text-xs text-muted-foreground">[Финальный ответ]</p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {chat.error ? (
            <p className="text-xs text-destructive">{chat.error}</p>
          ) : null}

          {lastSuggested.length ? (
            <SuggestedActionsChips
              actions={lastSuggested}
              onPick={(a) => onPickAction(a.label)}
              disabled={chat.isLoading || chat.phase === 'done'}
            />
          ) : null}

          {chat.phase !== 'done' ? (
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
                disabled={chat.isLoading}
              />
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  size="icon"
                  onClick={onSend}
                  disabled={!draft.trim() || chat.isLoading}
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
                    <Button type="button" size="sm" variant="outline">
                      Финальный ответ
                    </Button>
                  }
                  disabled={chat.isLoading}
                  onSubmit={(answer) => chat.submitFinalAnswer(answer)}
                />
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" onClick={chat.reset} disabled={chat.isLoading}>
              Пройти кейс заново
            </Button>
          )}
        </CardContent>
      </Card>
      {chat.phase === 'done' ? (
        <SolutionPanel evaluation={chat.evaluation} solution={solution ?? null} />
      ) : null}
    </div>
  );
}

export default CaseChatView;
