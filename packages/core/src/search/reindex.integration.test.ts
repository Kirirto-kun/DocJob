import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@docjob/db';
import { reembedDirtyCases } from './reindex.service';

const fakeEmbed = async () => Array.from({ length: 1536 }, () => 0.002);

describe('reembedDirtyCases (integration, real Postgres, mocked embedder)', () => {
  const ids: string[] = [];
  let authorId = '';

  beforeAll(async () => {
    const author = await prisma.user.create({
      data: {
        email: `core-search-reindex-${process.pid}-${Date.now()}@test.local`,
        passwordHash: 'unused-in-tests',
        name: 'Reindex Integration Test Author',
        role: 'DOCTOR',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    authorId = author.id;
  });

  afterAll(async () => {
    if (ids.length) await prisma.case.deleteMany({ where: { id: { in: ids } } });
    if (authorId) await prisma.user.deleteMany({ where: { id: authorId } });
  });

  it('sweeps dirty cases and clears them', async () => {
    for (let i = 0; i < 3; i++) {
      const c = await prisma.case.create({
        data: {
          authorId,
          name: `SP3 sweep ${Date.now()}-${i}`,
          body: { blocks: [] },
          // The production sweep orders oldest-first. Pin these fixtures to
          // the oldest practical timestamp and cap the sweep at 3, so this
          // test cannot re-embed dirty cases owned by concurrent test files.
          updatedAt: new Date(0),
        },
        select: { id: true },
      });
      ids.push(c.id);
    }
    // All three fixtures are dirty by default; the capped sweep selects them.
    const res = await reembedDirtyCases({ limit: 3, concurrency: 3, embed: fakeEmbed });
    expect(res.processed).toBe(3);
    const mine = await prisma.case.findMany({ where: { id: { in: ids } }, select: { embeddingDirty: true } });
    expect(mine.every((r) => r.embeddingDirty === false)).toBe(true);
  });
});
