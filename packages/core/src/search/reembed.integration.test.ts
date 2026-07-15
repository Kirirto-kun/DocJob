import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '@docjob/db';
import { reembedCase } from './embeddings';

const fakeEmbed = async () => Array.from({ length: 1536 }, () => 0.001);

async function seedCase(name: string): Promise<string> {
  const author = await prisma.user.findFirst({ select: { id: true } });
  if (!author) throw new Error('seed an admin first (pnpm --filter @docjob/db db:seed)');
  const c = await prisma.case.create({
    data: { authorId: author.id, name, body: { blocks: [] } },
    select: { id: true },
  });
  return c.id;
}

describe('reembedCase (integration, real Postgres, mocked embedder)', () => {
  const ids: string[] = [];
  afterAll(async () => { if (ids.length) await prisma.case.deleteMany({ where: { id: { in: ids } } }); });

  it('embeds a dirty case and clears the flag + writes bodyHash', async () => {
    const id = await seedCase(`SP3 reembed ${Date.now()}`); ids.push(id);
    const r = await reembedCase(id, { embed: fakeEmbed });
    expect(r).toBe('embedded');
    const row = await prisma.case.findUniqueOrThrow({ where: { id }, select: { embeddingDirty: true, bodyHash: true } });
    expect(row.embeddingDirty).toBe(false);
    expect(row.bodyHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('skips re-embedding when content is unchanged (second run)', async () => {
    const id = await seedCase(`SP3 unchanged ${Date.now()}`); ids.push(id);
    expect(await reembedCase(id, { embed: fakeEmbed })).toBe('embedded');
    expect(await reembedCase(id, { embed: fakeEmbed })).toBe('skipped-unchanged');
  });

  it('returns not-found for a missing id', async () => {
    expect(await reembedCase('does-not-exist', { embed: fakeEmbed })).toBe('not-found');
  });
});
