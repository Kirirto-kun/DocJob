import { config } from 'dotenv';
import { reindex } from '@docjob/core';

// Load env like the app (.env.local then .env).
config({ path: '.env.local' });
config({ path: '.env' });

async function runOnce(): Promise<void> {
  const res = await reindex.reembedDirtyCases({ limit: 200, concurrency: 3 });
  console.log(
    `[reembed] processed=${res.processed} embedded=${res.embedded} skipped=${res.skipped} failed=${res.failed}`,
  );
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('[reembed] OPENAI_API_KEY not set — dirty cases will be skipped.');
  }
  const loop = process.argv.includes('--loop');
  const intervalMs = Number(process.env.REEMBED_INTERVAL_MS ?? 60_000);
  if (!loop) {
    await runOnce();
    return;
  }
  // Simple long-running loop for a `worker` container / cron alternative.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await runOnce();
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => {
    if (!process.argv.includes('--loop')) {
      const { prisma } = await import('@docjob/db');
      await prisma.$disconnect();
    }
  });
