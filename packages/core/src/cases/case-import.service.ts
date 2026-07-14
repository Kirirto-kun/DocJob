import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { caseModeSchema, structuredCaseDraftSchema, type StructuredCaseDraft } from '@docjob/types';
import { assertAdmin, type Actor } from '../shared/actor';
import { DomainError, ValidationError } from '../shared/errors';
import { getOpenAI, DEFAULT_OPENAI_MODEL } from '../openai';

// Moved verbatim (behavior-preserving) from
// apps/web/src/ai/flows/structure-case-from-markdown.ts +
// apps/web/src/app/actions.ts#handleStructureCaseFromMarkdown (SP-1b Task 8).
// Uses core's own OpenAI client (packages/core/src/openai.ts, same pattern
// as search.service.ts's extractSearchIntent) instead of apps/web's
// `@/lib/openai` singleton + `@/ai/runChat` helper (both web-only / `@/`
// imports, forbidden in core). Both the old web flow file and
// apps/web/src/ai/runChat.ts became dead code once this moved (runChat had
// exactly one caller) and were deleted.

const structureCaseInputSchema = z.object({
  markdown: z.string().min(20),
  mode: caseModeSchema,
  hintedSubgroup: z.string().optional(),
  hintedSpecialty: z.string().optional(),
});
export type StructureCaseInput = z.infer<typeof structureCaseInputSchema>;

const SYSTEM_PROMPT = [
  'Ты разбираешь учебный медицинский/санэпид/менеджерский кейс из markdown в структурированный JSON для платформы DocJob.',
  'Выходи строго по схеме structured_case_draft.',
  '',
  'ПРАВИЛА:',
  '- В bodyMarkdown оставь полное «видимое» тело кейса: жалобы, анамнез, течение, исход, лабораторные показатели, картинки/таблицы (как markdown). НЕ включай туда блок «ОТВЕТ» / «РАЗБОР» / «ПРАВИЛЬНЫЙ ДИАГНОЗ» / «ЗАДАНИЕ ПО ДАННОМУ КЕЙСУ», если они есть в исходном тексте — это служебные секции, они платформе не нужны.',
  '- name: краткое название кейса. age/gender — null если не указаны (например для эпидемии или менеджмента).',
  '- specialty: специальность (например «Акушерство-гинекология»).',
  '- tags: 3–6 коротких тегов из текста.',
  '- НЕ используй эмодзи.',
  '- Все тексты на русском.',
].join('\n');

/**
 * Parse a raw markdown reference case into a structured draft via OpenAI.
 * Admin only — preserves the original `handleStructureCaseFromMarkdown`
 * server action's `requireAdmin()` gate exactly. Returns a
 * `structuredCaseDraftSchema` shape (no `solution`/`taskQuestions` — those
 * fields were already dropped from the schema in SP-1a).
 *
 * Two distinct failure modes are preserved from the original action:
 * - Input validation failure (markdown too short / bad mode) throws
 *   `ValidationError('Слишком короткий markdown для разбора.')`.
 * - Any OpenAI-side failure (network, refusal, missing key) is caught and
 *   rethrown as `DomainError('Не удалось разобрать markdown через OpenAI.')`,
 *   same generic wrap the web action used to apply in its outer try/catch.
 */
export async function structureCaseFromMarkdown(
  actor: Actor | null,
  input: StructureCaseInput,
): Promise<StructuredCaseDraft> {
  assertAdmin(actor, 'Импорт markdown — только для администратора.');

  const parsed = structureCaseInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('Слишком короткий markdown для разбора.');
  const { markdown, hintedSubgroup, hintedSpecialty } = parsed.data;

  const userParts = [
    hintedSubgroup ? `Подгруппа: ${hintedSubgroup}` : null,
    hintedSpecialty ? `Специальность (подсказка): ${hintedSpecialty}` : null,
    'MARKDOWN КЕЙСА:',
    markdown,
  ].filter((part): part is string => Boolean(part));

  try {
    const completion = await getOpenAI().chat.completions.parse({
      model: DEFAULT_OPENAI_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userParts.join('\n\n') },
      ],
      temperature: 0.2,
      response_format: zodResponseFormat(structuredCaseDraftSchema, 'structured_case_draft'),
    });

    const draft = completion.choices[0]?.message.parsed;
    if (!draft) {
      const refusal = completion.choices[0]?.message.refusal;
      throw new Error(refusal ? `OpenAI refused to comply: ${refusal}` : 'OpenAI returned no parsed content');
    }
    return draft;
  } catch (error) {
    console.error('[case-import.service] structureCaseFromMarkdown error', error);
    throw new DomainError('Не удалось разобрать markdown через OpenAI.');
  }
}
