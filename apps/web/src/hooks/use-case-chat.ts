'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

export function useCaseChat(caseId: string): UseCaseChatResult {
  const [session, setSession] = useState<SerializedChatSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const inFlightRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsInitializing(true);
      setError(null);
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
      inFlightRef.current?.abort();
      inFlightRef.current = null;
    };
  }, [caseId]);

  const send = useCallback(
    async (message: string, isFinal: boolean) => {
      if (isLoading) return;

      inFlightRef.current?.abort();
      const controller = new AbortController();
      inFlightRef.current = controller;

      setIsLoading(true);
      setError(null);

      const optimisticUser: ChatHistoryMessage = {
        role: 'user',
        content: message,
        createdAt: new Date().toISOString(),
        isFinalAnswer: isFinal || undefined,
      };
      setSession((prev) =>
        prev ? { ...prev, messages: [...prev.messages, optimisticUser] } : prev,
      );

      let result;
      try {
        result = await handleCaseChat({
          caseId,
          userMessage: message,
          submittingFinalAnswer: isFinal,
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setSession((prev) =>
          prev
            ? { ...prev, messages: prev.messages.filter((m) => m !== optimisticUser) }
            : prev,
        );
        setError(err instanceof Error ? err.message : 'Не удалось отправить сообщение.');
        setIsLoading(false);
        return;
      }

      if (controller.signal.aborted) return;

      if (!result.success) {
        setSession((prev) =>
          prev
            ? { ...prev, messages: prev.messages.filter((m) => m !== optimisticUser) }
            : prev,
        );
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
      if (inFlightRef.current === controller) inFlightRef.current = null;
    },
    [caseId, isLoading],
  );

  const reset = useCallback(async () => {
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;

    setIsLoading(true);
    setError(null);
    await resetChatSession(caseId);
    if (controller.signal.aborted) return;
    const intro = await startCaseChat(caseId);
    if (controller.signal.aborted) return;
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
    if (inFlightRef.current === controller) inFlightRef.current = null;
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
