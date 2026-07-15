import { prisma } from '@docjob/db';

/**
 * Lexical arm of the hybrid search: Russian FTS over the generated `searchDoc`
 * (ranked by ts_rank) unioned with trigram similarity on `name` (typo/Kazakh
 * tolerance). Returns ids in rank order plus a highlighted snippet for the UX
 * "why matched" line. Raw SQL — the generated column + GIN indexes (SP-3 T1)
 * do the work. Guarded: a blank query short-circuits to [].
 */
export async function lexicalSearch(
  query: string,
  limit: number,
): Promise<Array<{ id: string; snippet: string | null }>> {
  const q = query.trim();
  if (!q) return [];
  // plainto_tsquery handles user text safely (no tsquery syntax injection).
  const rows = await prisma.$queryRaw<Array<{ id: string; snippet: string | null }>>`
    SELECT id,
      ts_headline('russian', coalesce(teaser, name),
        plainto_tsquery('russian', ${q}),
        'MaxFragments=1,MaxWords=18,MinWords=5,StartSel=<mark>,StopSel=</mark>') AS snippet
    FROM "Case"
    WHERE "searchDoc" @@ plainto_tsquery('russian', ${q})
       OR "name" % ${q}
    ORDER BY
      ts_rank("searchDoc", plainto_tsquery('russian', ${q})) DESC,
      similarity("name", ${q}) DESC
    LIMIT ${limit}
  `;
  return rows;
}
