import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '@docjob/db';
import { reembedDirtyCases } from './reindex.service';

const fakeEmbed = async () => Array.from({ length: 1536 }, () => 0.002);

describe('reembedDirtyCases (integration, real Postgres, mocked embedder)', () => {
  const ids: string[] = [];
  afterAll(async () => { if (ids.length) await prisma.case.deleteMany({ where: { id: { in: ids } } }); });

  it('sweeps dirty cases and clears them', async () => {
    const author = await prisma.user.findFirstOrThrow({ select: { id: true } });
    for (let i = 0; i < 3; i++) {
      const c = await prisma.case.create({
        data: { authorId: author.id, name: `SP3 sweep ${Date.now()}-${i}`, body: { blocks: [] } },
        select: { id: true },
      });
      ids.push(c.id);
    }
    // The 3 new rows are dirty by default; other pre-existing dirty rows may
    // also be swept — assert on OUR rows' final state, not global counts.
    const res = await reembedDirtyCases({ limit: 500, concurrency: 4, embed: fakeEmbed });
    expect(res.processed).toBeGreaterThanOrEqual(3);
    const mine = await prisma.case.findMany({ where: { id: { in: ids } }, select: { embeddingDirty: true } });
    expect(mine.every((r) => r.embeddingDirty === false)).toBe(true);
  });
});
