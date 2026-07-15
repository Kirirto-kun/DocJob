import { prisma } from '@docjob/db';
import { reembedCase } from './embeddings';

/**
 * Background sweep of cases whose embedding is stale (`embeddingDirty = true`).
 * The durability backbone of embed-on-write (spec §6): the write path only
 * flips the dirty flag + best-effort inline embeds; this worker guarantees any
 * row a failed/absent inline embed left dirty is eventually re-embedded. Uses
 * `reembedCase`, which is itself concurrency-guarded (updatedAt snapshot), so
 * running this concurrently with live edits is safe. Never throws.
 */
export async function reembedDirtyCases(opts?: {
  limit?: number;
  concurrency?: number;
  embed?: (text: string) => Promise<number[]>;
}): Promise<{ processed: number; embedded: number; skipped: number; failed: number }> {
  const limit = opts?.limit ?? 100;
  const concurrency = Math.max(1, opts?.concurrency ?? 3);
  const tally = { processed: 0, embedded: 0, skipped: 0, failed: 0 };

  try {
    const dirty = await prisma.case.findMany({
      where: { embeddingDirty: true },
      select: { id: true },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });

    let cursor = 0;
    async function worker(): Promise<void> {
      while (cursor < dirty.length) {
        const item = dirty[cursor++];
        const r = await reembedCase(item.id, opts?.embed ? { embed: opts.embed } : undefined);
        tally.processed++;
        if (r === 'embedded') tally.embedded++;
        else if (r === 'failed') tally.failed++;
        else tally.skipped++;
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, dirty.length) }, worker));
  } catch (error) {
    console.error('[reindex] reembedDirtyCases sweep failed', error);
  }

  return tally;
}
