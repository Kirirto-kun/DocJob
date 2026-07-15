import { config } from 'dotenv';
import { prisma } from '@docjob/db';
import { reembedCase } from '@docjob/core';

// Load env the same way the app does (.env.local then .env).
config({ path: '.env.local' });
config({ path: '.env' });

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required to embed cases.');
  }

  // Cases without an embedding yet, or whose embedding is stale.
  const missing = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Case" WHERE "embeddingDirty" = true OR embedding IS NULL
  `;

  if (missing.length === 0) {
    console.log('All cases already embedded. Nothing to do.');
    return;
  }

  console.log(`Embedding ${missing.length} case(s)...`);

  let embedded = 0;
  let failed = 0;
  let skipped = 0;
  for (const { id } of missing) {
    // Delegate to the single guarded core path: builds text, embeds, and
    // writes embedding + bodyHash + embeddingDirty=false atomically, so a
    // second run of this script finds rows current via bodyHash and skips
    // them without paying OpenAI again.
    const result = await reembedCase(id);
    if (result === 'embedded') {
      embedded += 1;
      console.log(`  + embedded ${id}`);
    } else if (result === 'failed') {
      failed += 1;
      console.error(`  ! failed ${id}`);
    } else {
      skipped += 1;
      console.log(`  ~ skipped ${id} (${result})`);
    }
  }

  console.log(`Done. Embedded ${embedded}, failed ${failed}, skipped ${skipped}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
