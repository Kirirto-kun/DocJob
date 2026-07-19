import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@docjob/db';
import { reembedCase } from './embeddings';

const fakeEmbed = async () => Array.from({ length: 1536 }, () => 0.001);

async function seedCase(authorId: string, name: string): Promise<string> {
  const c = await prisma.case.create({
    data: { authorId, name, body: { blocks: [] } },
    select: { id: true },
  });
  return c.id;
}

describe('reembedCase (integration, real Postgres, mocked embedder)', () => {
  const ids: string[] = [];
  let authorId = '';

  beforeAll(async () => {
    const author = await prisma.user.create({
      data: {
        email: `core-search-reembed-${process.pid}-${Date.now()}@test.local`,
        passwordHash: 'unused-in-tests',
        name: 'Re-embed Integration Test Author',
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

  it('embeds a dirty case and clears the flag + writes bodyHash', async () => {
    const id = await seedCase(authorId, `SP3 reembed ${Date.now()}`); ids.push(id);
    const r = await reembedCase(id, { embed: fakeEmbed });
    expect(r).toBe('embedded');
    const row = await prisma.case.findUniqueOrThrow({ where: { id }, select: { embeddingDirty: true, bodyHash: true } });
    expect(row.embeddingDirty).toBe(false);
    expect(row.bodyHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('skips re-embedding when content is unchanged (second run)', async () => {
    const id = await seedCase(authorId, `SP3 unchanged ${Date.now()}`); ids.push(id);
    expect(await reembedCase(id, { embed: fakeEmbed })).toBe('embedded');
    expect(await reembedCase(id, { embed: fakeEmbed })).toBe('skipped-unchanged');
  });

  it('returns not-found for a missing id', async () => {
    expect(await reembedCase('does-not-exist', { embed: fakeEmbed })).toBe('not-found');
  });
});
