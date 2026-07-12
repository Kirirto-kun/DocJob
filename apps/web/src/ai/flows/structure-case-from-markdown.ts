import { z } from "zod";
import { runChat } from "@/ai/runChat";
import {
  caseModeSchema,
  expectedSolutionKind,
  structuredCaseDraftSchema,
  type CaseMode,
  type StructuredCaseDraft,
} from "@/lib/case-schema";

export const structureCaseInputSchema = z.object({
  markdown: z.string().min(20),
  mode: caseModeSchema,
  hintedSubgroup: z.string().optional(),
  hintedSpecialty: z.string().optional(),
});
export type StructureCaseInput = z.infer<typeof structureCaseInputSchema>;

const SYSTEM_PROMPT = (mode: CaseMode) =>
  [
    "Ты разбираешь учебный медицинский/санэпид/менеджерский кейс из markdown в структурированный JSON для платформы DocJob.",
    "Выходи строго по схеме structured_case_draft.",
    "",
    "ПРАВИЛА:",
    "- В bodyMarkdown оставь полное «видимое» тело кейса: жалобы, анамнез, течение, исход, лабораторные показатели, картинки/таблицы (как markdown). НЕ включай туда блок «ОТВЕТ» / «РАЗБОР» / «ПРАВИЛЬНЫЙ ДИАГНОЗ».",
    "- В taskQuestions перенеси нумерованный список вопросов из секции «ЗАДАНИЕ ПО ДАННОМУ КЕЙСУ».",
    "- В solution перенеси скрытый эталон.",
    `- Для текущего mode (${mode}) ожидаемый kind = ${expectedSolutionKind(mode)}. Используй именно эту дискриминанту в solution.kind.`,
    "  • incident (для CLINICAL_QUEST/SANEPID_INVESTIGATION): diagnosis (МКБ-10 + полный текст), errors[] (список допущенных ошибок), correctAlgorithm (markdown с протоколом), preventability ('full' | 'conditional' | 'none').",
    "  • reflection (для BEST_PRACTICE/MANAGEMENT): keyInsights[] (что нового/правильного), correctDecisions[] (правильные решения), lessonsLearned (markdown).",
    "- name: краткое название кейса. age/gender — null если не указаны (например для эпидемии или менеджмента).",
    "- specialty: специальность (например «Акушерство-гинекология»).",
    "- tags: 3–6 коротких тегов из текста.",
    "- НЕ используй эмодзи.",
    "- Все тексты на русском.",
  ].join("\n");

export async function structureCaseFromMarkdown(
  input: StructureCaseInput,
): Promise<StructuredCaseDraft> {
  const userParts = [
    input.hintedSubgroup ? `Подгруппа: ${input.hintedSubgroup}` : null,
    input.hintedSpecialty ? `Специальность (подсказка): ${input.hintedSpecialty}` : null,
    "MARKDOWN КЕЙСА:",
    input.markdown,
  ].filter(Boolean) as string[];

  return runChat(structuredCaseDraftSchema, [
    { role: "system", content: SYSTEM_PROMPT(input.mode) },
    { role: "user", content: userParts.join("\n\n") },
  ], {
    schemaName: "structured_case_draft",
    temperature: 0.2,
  });
}
