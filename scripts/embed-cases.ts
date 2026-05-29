import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { buildCaseEmbeddingText, embedText, toVectorLiteral } from '../src/lib/embeddings';

// Load env the same way the app does (.env.local then .env).
config({ path: '.env.local' });
config({ path: '.env' });

const prisma = new PrismaClient();

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required to embed cases.');
  }

  // Cases without an embedding yet.
  const missing = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Case" WHERE embedding IS NULL
  `;

  if (missing.length === 0) {
    console.log('All cases already embedded. Nothing to do.');
    return;
  }

  console.log(`Embedding ${missing.length} case(s)...`);

  let done = 0;
  let failed = 0;
  for (const { id } of missing) {
    const c = await prisma.case.findUnique({
      where: { id },
      select: {
        name: true,
        teaser: true,
        primaryCondition: true,
        specialty: true,
        subgroup: true,
        tags: true,
        body: true,
      },
    });
    if (!c) {
      console.warn(`  - skip ${id} (not found)`);
      continue;
    }
    try {
      const text = buildCaseEmbeddingText(c);
      const vector = await embedText(text);
      const literal = toVectorLiteral(vector);
      await prisma.$executeRaw`UPDATE "Case" SET embedding = ${literal}::vector WHERE id = ${id}`;
      done += 1;
      console.log(`  + embedded ${id} (${c.name})`);
    } catch (error) {
      failed += 1;
      console.error(`  ! failed ${id}:`, error);
    }
  }

  console.log(`Done. Embedded ${done}, failed ${failed}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
