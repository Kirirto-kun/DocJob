import { config } from 'dotenv';
import { reindex } from '@docjob/core';

// Load env like the app (.env.local then .env).
config({ path: '.env.local' });
config({ path: '.env' });

// Graceful shutdown (SP-5 T3): `docker compose down` / a rolling restart
// sends SIGTERM to this process. Without handling it, Node's default action
// is to die immediately mid-sweep, potentially severing an in-flight
// `reembedDirtyCases` batch (partial writes are fine — `reembedCase` is
// per-row and idempotent — but an abrupt kill also skips `prisma.$disconnect()`,
// leaving the connection to Postgres to be cleaned up by the pool's own
// timeout instead of closing cleanly). This flag makes the `--loop` loop
// check between passes and exit after the current sweep finishes, then
// disconnects Prisma before the process exits.
let shuttingDown = false;

function requestShutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return; // repeat signal ignored; Docker will SIGKILL after the grace period
  shuttingDown = true;
  console.log(`[reembed] received ${signal}, finishing current sweep then exiting…`);
}

process.on('SIGTERM', requestShutdown);
process.on('SIGINT', requestShutdown);

async function runOnce(): Promise<void> {
  const res = await reindex.reembedDirtyCases({ limit: 200, concurrency: 3 });
  console.log(
    `[reembed] processed=${res.processed} embedded=${res.embedded} skipped=${res.skipped} failed=${res.failed}`,
  );
}

/** Sleep that wakes early if a shutdown was requested mid-wait, so SIGTERM during the idle gap doesn't cost up to `intervalMs`. */
function sleepUnlessShuttingDown(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    const check = setInterval(() => {
      if (shuttingDown) {
        clearTimeout(timer);
        clearInterval(check);
        resolve();
      }
    }, 250);
    timer.unref?.();
    check.unref?.();
  });
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
  // Exits cleanly once a SIGTERM/SIGINT is observed, rather than looping
  // forever — see `shuttingDown` above.
  while (!shuttingDown) {
    await runOnce();
    if (shuttingDown) break;
    await sleepUnlessShuttingDown(intervalMs);
  }
  console.log('[reembed] shut down cleanly.');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => {
    const { prisma } = await import('@docjob/db');
    await prisma.$disconnect();
  });
