/* E2E smoke for OpenAI integration. Run: npx tsx scripts/e2e-smoke.ts */
import { z } from 'zod';
import { runChat } from '../src/ai/runChat';
import { runIntroMessage, runCaseChat } from '../src/ai/flows/case-chat-flow';
import { prisma } from '../src/lib/prisma';
import { caseSolutionSchema, caseBodySchema } from '../src/lib/case-schema';

async function main() {
  console.log('--- 1. runChat smoke ---');
  const helloSchema = z.object({ greeting: z.string(), language: z.string() });
  const hello = await runChat(helloSchema, [
    { role: 'system', content: 'Always answer in Russian.' },
    { role: 'user', content: 'Поприветствуй пользователя одним предложением.' },
  ]);
  console.log('hello:', hello);

  console.log('\n--- 2. Pick first clinical case ---');
  const c = await prisma.case.findFirst({
    where: { subgroup: 'clinical' },
    select: {
      id: true,
      name: true,
      mode: true,
      body: true,
      solution: true,
      taskQuestions: true,
      specialty: true,
    },
  });
  if (!c) {
    console.error('No clinical case in DB. Run db:seed first.');
    process.exit(1);
  }
  console.log('case:', c.name, '(id:', c.id, ')');

  const bodyParse = caseBodySchema.safeParse(c.body);
  const body = bodyParse.success ? bodyParse.data : { blocks: [] };
  const solutionParse = c.solution ? caseSolutionSchema.safeParse(c.solution) : null;
  const solution = solutionParse?.success ? solutionParse.data : null;

  function bodyText(): string {
    const blocks = body.blocks;
    if (!Array.isArray(blocks)) return '';
    const out: string[] = [];
    for (const raw of blocks) {
      if (!raw || typeof raw !== 'object') continue;
      const block = raw as Record<string, unknown>;
      const content = block.content;
      if (typeof content === 'string') {
        out.push(content);
      } else if (Array.isArray(content)) {
        for (const inline of content) {
          if (inline && typeof inline === 'object' && 'text' in inline) {
            const text = (inline as Record<string, unknown>).text;
            if (typeof text === 'string') out.push(text);
          }
        }
      }
    }
    return out.join(' ');
  }

  console.log('\n--- 3. runIntroMessage ---');
  const intro = await runIntroMessage({
    caseMode: c.mode,
    caseName: c.name,
    caseSpecialty: c.specialty,
    caseBodyText: bodyText().slice(0, 2000),
    taskQuestions: c.taskQuestions,
    solution,
  });
  console.log('intro reply:', intro.reply);
  console.log('intro phase:', intro.phase);
  console.log('intro suggestedActions:', intro.suggestedActions);

  console.log('\n--- 4. runCaseChat (simple discussion) ---');
  const turn1 = await runCaseChat({
    caseMode: c.mode,
    caseName: c.name,
    caseSpecialty: c.specialty,
    caseBodyText: bodyText().slice(0, 2000),
    taskQuestions: c.taskQuestions,
    solution,
    history: [
      { role: 'assistant', content: intro.reply, createdAt: new Date().toISOString() },
    ],
    userMessage: 'Какие лабораторные показатели мне стоит обсудить в этом кейсе?',
  });
  console.log('turn1 reply:', turn1.reply.slice(0, 400));
  console.log('turn1 phase:', turn1.phase);
  console.log('turn1 evaluation:', turn1.evaluation);

  console.log('\n--- 5. runCaseChat (final answer) ---');
  const finalAnswer =
    solution && solution.kind === 'incident'
      ? `Диагноз: ${solution.diagnosis}. Допущенные ошибки: ${solution.errors.slice(0, 2).join('; ')}. Алгоритм: ${solution.correctAlgorithm.slice(0, 200)}. Предотвратимость: ${solution.preventability}.`
      : 'Финальный ответ: ключевые выводы и решения по моему мнению.';

  const turn2 = await runCaseChat({
    caseMode: c.mode,
    caseName: c.name,
    caseSpecialty: c.specialty,
    caseBodyText: bodyText().slice(0, 2000),
    taskQuestions: c.taskQuestions,
    solution,
    history: [
      { role: 'assistant', content: intro.reply, createdAt: new Date().toISOString() },
      { role: 'user', content: 'Какие лабораторные показатели?', createdAt: new Date().toISOString() },
      { role: 'assistant', content: turn1.reply, createdAt: new Date().toISOString() },
    ],
    userMessage: finalAnswer,
    submittingFinalAnswer: true,
  });
  console.log('final phase:', turn2.phase);
  console.log('final evaluation:', JSON.stringify(turn2.evaluation, null, 2));
  console.log('final reply:', turn2.reply.slice(0, 500));

  await prisma.$disconnect();
  console.log('\n--- DONE ---');
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
