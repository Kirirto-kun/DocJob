'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getChatSession,
  handleCaseChat,
  resetChatSession,
  startCaseChat,
  type SerializedChatSession,
} from '@/app/actions';
import type { ChatEvaluation, ChatHistoryMessage, ChatPhase } from '@/lib/case-schema';

export type UseCaseChatResult = {
  messages: ChatHistoryMessage[];
  phase: ChatPhase;
  evaluation: ChatEvaluation | null;
  finalAnswer: string | null;
  isLoading: boolean;
  isInitializing: boolean;
  error: string | null;
  sendMessage: (message: string) => Promise<void>;
  submitFinalAnswer: (answer: string) => Promise<void>;
  reset: () => Promise<void>;
};

// STUB — заменяется в Волне 2 (Unit U2) на полноценный hook с оптимистичным
// рендером, abort'ом, ретраями и т. п. Сейчас — рабочий минимум.
export function useCaseChat(caseId: string): UseCaseChatResult {
  const [session, setSession] = useState<SerializedChatSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsInitializing(true);
      const existing = await getChatSession(caseId);
      if (cancelled) return;
      if (existing.success && existing.data) {
        setSession(existing.data);
        setIsInitializing(false);
        return;
      }
      const intro = await startCaseChat(caseId);
      if (cancelled) return;
      if (intro.success) {
        setSession({
          id: 'pending',
          caseId,
          phase: intro.data.phase,
          messages: [intro.data.reply],
          finalAnswer: intro.data.finalAnswer,
          evaluation: intro.data.evaluation,
          completedAt: null,
        });
      } else {
        setError(intro.error);
      }
      setIsInitializing(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  const send = useCallback(
    async (message: string, isFinal: boolean) => {
      setIsLoading(true);
      setError(null);
      const optimisticUser: ChatHistoryMessage = {
        role: 'user',
        content: message,
        createdAt: new Date().toISOString(),
        isFinalAnswer: isFinal || undefined,
      };
      setSession((prev) =>
        prev
          ? { ...prev, messages: [...prev.messages, optimisticUser] }
          : prev,
      );
      const result = await handleCaseChat({
        caseId,
        userMessage: message,
        submittingFinalAnswer: isFinal,
      });
      if (!result.success) {
        setError(result.error);
        setIsLoading(false);
        return;
      }
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: [...prev.messages, result.data.reply],
          phase: result.data.phase,
          evaluation: result.data.evaluation,
          finalAnswer: result.data.finalAnswer,
        };
      });
      setIsLoading(false);
    },
    [caseId],
  );

  const reset = useCallback(async () => {
    setIsLoading(true);
    await resetChatSession(caseId);
    const intro = await startCaseChat(caseId);
    if (intro.success) {
      setSession({
        id: 'pending',
        caseId,
        phase: intro.data.phase,
        messages: [intro.data.reply],
        finalAnswer: null,
        evaluation: null,
        completedAt: null,
      });
    } else {
      setError(intro.error);
    }
    setIsLoading(false);
  }, [caseId]);

  return {
    messages: session?.messages ?? [],
    phase: session?.phase ?? 'discussing',
    evaluation: session?.evaluation ?? null,
    finalAnswer: session?.finalAnswer ?? null,
    isLoading,
    isInitializing,
    error,
    sendMessage: (m) => send(m, false),
    submitFinalAnswer: (m) => send(m, true),
    reset,
  };
}

export default useCaseChat;
