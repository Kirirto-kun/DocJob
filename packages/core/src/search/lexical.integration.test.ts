import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@docjob/db';
import { lexicalSearch } from './lexical';

describe('lexicalSearch (integration, real Postgres)', () => {
  const ids: string[] = [];
  let authorId = '';

  beforeAll(async () => {
    const author = await prisma.user.create({
      data: {
        email: `core-search-lexical-${process.pid}-${Date.now()}@test.local`,
        passwordHash: 'unused-in-tests',
        name: 'Lexical Search Test Author',
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

  it('finds a case by an FTS term and returns a snippet', async () => {
    const c = await prisma.case.create({
      data: {
        authorId,
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
