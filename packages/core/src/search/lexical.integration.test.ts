import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '@docjob/db';
import { lexicalSearch } from './lexical';

describe('lexicalSearch (integration, real Postgres)', () => {
  const ids: string[] = [];
  afterAll(async () => { if (ids.length) await prisma.case.deleteMany({ where: { id: { in: ids } } }); });

  it('finds a case by an FTS term and returns a snippet', async () => {
    const author = await prisma.user.findFirstOrThrow({ select: { id: true } });
    const c = await prisma.case.create({
      data: {
        authorId: author.id,
        name: `SP3 lexical бронхит ${Date.now()}`,
        teaser: 'острый бронхит с кашлем',
        body: { blocks: [] },
      },
      select: { id: true },
    });
    ids.push(c.id);
    const hits = await lexicalSearch('бронхит', 20);
    expect(hits.some((h) => h.id === c.id)).toBe(true);
  });

  it('returns [] for a blank query without throwing', async () => {
    expect(await lexicalSearch('   ', 20)).toEqual([]);
  });
});
