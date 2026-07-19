/**
 * Integration test for the SP-3 FTS migration — runs against the real dev
 * Postgres (DATABASE_URL from dotenv, same harness as search.service.test.ts).
 * Seeds a throwaway case, asserts the generated `searchDoc` populated itself
 * and the GIN/trgm indexes exist and match.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@docjob/db';

describe('SP-3 FTS migration (integration, real Postgres)', () => {
  const ids: string[] = [];
  let authorId = '';

  beforeAll(async () => {
    const author = await prisma.user.create({
      data: {
        email: `core-search-fts-${process.pid}-${Date.now()}@test.local`,
        passwordHash: 'unused-in-tests',
        name: 'FTS Integration Test Author',
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

  it('created the searchDoc + trigram indexes', async () => {
    const idx = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'Case'
    `;
    const names = idx.map((r) => r.indexname);
    expect(names).toContain('Case_searchDoc_idx');
    expect(names).toContain('Case_name_trgm_idx');
    expect(names).toContain('Case_teaser_trgm_idx');
  });

  it('auto-populates searchDoc from flat fields + body and matches an FTS query', async () => {
    const c = await prisma.case.create({
      data: {
        authorId,
        name: 'Пневмония у пожилого пациента',
        teaser: 'Кашель и лихорадка',
        specialty: 'Пульмонология',
        tags: ['пневмония', 'антибиотики'],
        body: { blocks: [{ type: 'paragraph', content: [{ type: 'text', text: 'рентген грудной клетки показал инфильтрат' }] }] },
      },
      select: { id: true },
    });
    ids.push(c.id);

    // Matches a flat-field term.
    const byField = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Case" WHERE id = ${c.id} AND "searchDoc" @@ plainto_tsquery('russian', 'пневмония')
    `;
    expect(byField).toHaveLength(1);

    // Matches a term that only exists inside the BlockNote body JSON.
    const byBody = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Case" WHERE id = ${c.id} AND "searchDoc" @@ plainto_tsquery('russian', 'инфильтрат')
    `;
    expect(byBody).toHaveLength(1);

    // pg_trgm is usable: similarity() returns > 0 for overlapping strings
    // (deterministic — shared trigrams — unlike a threshold-dependent `%` match).
    const sim = await prisma.$queryRaw<Array<{ s: number }>>`
      SELECT similarity(${'Пневмония у пожилого пациента'}, 'пневмония') AS s
    `;
    expect(Number(sim[0].s)).toBeGreaterThan(0);
  });
});
