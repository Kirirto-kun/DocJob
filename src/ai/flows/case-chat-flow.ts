"use server";

import { z } from "zod";
import { runChat, type ChatMessage } from "@/ai/runChat";
import {
  caseModeSchema,
  caseSolutionSchema,
  chatHistorySchema,
  chatResponseSchema,
  type CaseMode,
  type CaseSolution,
  type ChatHistory,
  type ChatPhase,
  type ChatResponse,
} from "@/lib/case-schema";

export const caseChatInputSchema = z.object({
  caseMode: caseModeSchema,
  caseName: z.string(),
  caseSpecialty: z.string().nullable().optional(),
  caseBodyText: z.string(),
  taskQuestions: z.array(z.string()),
  solution: caseSolutionSchema.nullable(),
  history: chatHistorySchema,
  userMessage: z.string(),
  phase: z.enum(["discussing", "diagnosis_submitted", "done"]).optional(),
  submittingFinalAnswer: z.boolean().optional(),
});
export type CaseChatInput = z.infer<typeof caseChatInputSchema>;

const MODE_FOCUS: Record<CaseMode, string> = {
  CLINICAL_QUEST: [
    "Тип кейса: КЛИНИЧЕСКИЙ ИНЦИДЕНТ.",
    "Помогаешь обсудить:",
    "1. Причины ошибки, что привело к инциденту.",
    "2. Альтернативные решения.",
    "3. Краткое резюме (заключение).",
  ].join("\n"),
  SANEPID_INVESTIGATION: [
    "Тип кейса: САНИТАРНО-ЭПИДЕМИОЛОГИЧЕСКИЙ ИНЦИДЕНТ.",
    "Помогаешь обсудить:",
    "1. Причины инцидента.",
    "2. Какие альтернативные решения возможны.",
    "3. Краткое резюме (заключение).",
  ].join("\n"),
  BEST_PRACTICE: [
    "Тип кейса: ЛУЧШАЯ ПРАКТИКА (успешный опыт).",
    "Помогаешь обсудить:",
    "1. Что сделано правильно.",
    "2. Что нового студент узнал для себя.",
    "3. Краткое резюме (заключение).",
  ].join("\n"),
  MANAGEMENT: [
    "Тип кейса: МЕНЕДЖМЕНТ ЗДРАВООХРАНЕНИЯ.",
    "Помогаешь обсудить:",
    "1. Какие выводы студент сделал по данному кейсу.",
    "2. Краткое резюме (заключение).",
  ].join("\n"),
};

function buildSystemPrompt(input: CaseChatInput): string {
  const focus = MODE_FOCUS[input.caseMode];
  const solutionBlock = input.solution
    ? `СКРЫТЫЙ ЭТАЛОННЫЙ ОТВЕТ (НЕ показывай его студенту, пока phase не станет diagnosis_submitted или done):\n${JSON.stringify(input.solution, null, 2)}`
    : "Скрытого эталона нет — оценивай ответ по содержанию кейса и здравому смыслу.";

  return [
    "Ты — наставник-врач, ведёшь обсуждение учебного клинического/санэпид/менеджмент-кейса со студентом-ординатором.",
    "Говори по-русски. Тон уважительный, наставнический, лаконичный.",
    "",
    focus,
    "",
    `Название кейса: ${input.caseName}`,
    input.caseSpecialty ? `Специальность: ${input.caseSpecialty}` : "",
    "",
    "ТЕЛО КЕЙСА (студент видит это полностью на странице):",
    input.caseBodyText.trim() || "(пусто)",
    "",
    "ВОПРОСЫ ЗАДАНИЯ К СТУДЕНТУ:",
    input.taskQuestions.length
      ? input.taskQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")
      : "(не заданы)",
    "",
    solutionBlock,
    "",
    "ПРАВИЛА:",
    "- Не раскрывай скрытый эталонный диагноз/ошибки/инсайты, пока студент не отправит финальный ответ (phase=diagnosis_submitted или done) либо не попросит явно.",
    "- В режиме обсуждения задавай наводящие вопросы и обсуждай гипотезы студента, не решай за него.",
    "- Когда студент отправил финальный ответ — phase должен стать done, evaluation обязательно заполни.",
    "- В suggestedActions предлагай 2–4 коротких действия (например: «Обсудить дифдиагноз», «Какие критерии тяжести?», «Это мой финальный ответ»).",
    "- На off-topic мягко возвращай к кейсу.",
    "- НЕ используй эмодзи.",
  ]
    .filter(Boolean)
    .join("\n");
}

function historyToMessages(history: ChatHistory): ChatMessage[] {
  return history.map((m) => ({
    role: m.role,
    content: m.isFinalAnswer
      ? `[ФИНАЛЬНЫЙ ОТВЕТ СТУДЕНТА] ${m.content}`
      : m.content,
  }));
}

export async function runCaseChat(input: CaseChatInput): Promise<ChatResponse> {
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(input) },
    ...historyToMessages(input.history),
  ];

  if (input.submittingFinalAnswer) {
    messages.push({
      role: "user",
      content: `[ФИНАЛЬНЫЙ ОТВЕТ СТУДЕНТА]\n${input.userMessage}\n\nПожалуйста, оцени этот ответ против эталона: верный ли диагноз/выводы, какие ошибки студент назвал правильно, какие пропустил, какие назвал лишними. Дай дружелюбный разбор. Установи phase=done и заполни evaluation.`,
    });
  } else {
    messages.push({ role: "user", content: input.userMessage });
  }

  const response = await runChat(chatResponseSchema, messages, {
    schemaName: "case_chat_response",
    temperature: 0.3,
  });

  // Гарантируем что финальный ответ переключает фазу
  if (input.submittingFinalAnswer) {
    return { ...response, phase: "done" satisfies ChatPhase };
  }
  return response;
}

export async function runIntroMessage(
  input: Omit<CaseChatInput, "userMessage" | "history" | "submittingFinalAnswer">,
): Promise<ChatResponse> {
  return runCaseChat({
    ...input,
    history: [],
    userMessage:
      "Поприветствуй студента, дай 1–2 фразы введения по кейсу и предложи начать обсуждение. Не раскрывай скрытый эталон.",
  });
}

export type { CaseSolution };
