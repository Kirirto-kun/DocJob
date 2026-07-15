import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { prisma, type Prisma } from '@docjob/db';
import { assertApproved, type Actor } from '../shared/actor';
import { DomainError } from '../shared/errors';
import { serializeCase, type SerializedCase } from '../cases/case.mapper';
import { getOpenAI, DEFAULT_OPENAI_MODEL } from '../openai';
import { embedText, toVectorLiteral } from './embeddings';

// Moved verbatim from the "RAG hybrid case search" section of
// apps/web/src/app/actions.ts (SP-1b Task 4). Behavior-preserving relocation
// only — hybrid vector+lexical fusion / `embeddingDirty` reindexing are SP-3
// work, NOT done here.

const searchIntentSchema = z.object({
  refinedQuery: z
    .string()
    .describe('A concise medical paraphrase of the query, optimized for semantic search.'),
  tags: z
    .array(z.string())
    .describe('Up to ~6 clinical keywords/tags extracted from the query (symptoms, conditions, procedures).'),
  specialty: z
    .string()
    .nullable()
    .describe('The most relevant medical specialty in Russian, or null if unclear.'),
  subgroup: z
    .string()
    .nullable()
    .describe('One of: clinical, sanepid, best_practices, management — or null if unclear.'),
});

type SearchIntent = z.infer<typeof searchIntentSchema>;

const SEARCH_INCLUDE = { images: true, attachments: true } as const;

function normSearch(s: string): string {
  return s.toLowerCase().trim();
}

/**
 * Substring fallback search over name/teaser/primaryCondition/specialty/tags.
 * Used when there is no API key or no embedded cases yet.
 */
async function fallbackSearchCases(query: string): Promise<SerializedCase[]> {
  const q = query.trim();
  const where: Prisma.CaseWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { teaser: { contains: q, mode: 'insensitive' } },
          { primaryCondition: { contains: q, mode: 'insensitive' } },
          { specialty: { contains: q, mode: 'insensitive' } },
          { tags: { hasSome: [q] } },
        ],
      }
    : {};
  const rows = await prisma.case.findMany({
    where,
    include: SEARCH_INCLUDE,
    orderBy: { updatedAt: 'desc' },
    take: 12,
  });
  return rows.map(serializeCase);
}

/**
 * LLM intent extraction step of the hybrid search — same call as the old
 * `runChat(searchIntentSchema, ...)` in actions.ts, but using core's own
 * OpenAI client (apps/web's `src/ai/runChat.ts` helper is web-only and
 * still used by structure-case-from-markdown; core gets an equivalent
 * inline call rather than importing it).
 */
async function extractSearchIntent(query: string): Promise<SearchIntent> {
  const completion = await getOpenAI().chat.completions.parse({
    model: DEFAULT_OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content:
          "You extract structured search intent from a clinician's natural-language query about medical teaching cases. " +
          'Return a refined query suitable for semantic search, relevant clinical tags, and (if clear) a specialty and subgroup. ' +
          'Subgroup must be one of: clinical, sanepid, best_practices, management.',
      },
      { role: 'user', content: query },
    ],
    temperature: 0.2,
    response_format: zodResponseFormat(searchIntentSchema, 'search_intent'),
  });

  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) {
    const refusal = completion.choices[0]?.message.refusal;
    throw new Error(
      refusal ? `OpenAI refused to comply: ${refusal}` : 'OpenAI returned no parsed content',
    );
  }
  return parsed;
}

/**
 * Hybrid RAG search: LLM extracts intent (tags/specialty/subgroup), we embed
 * the refined query, run a pgvector KNN over Case.embedding, then boost rows
 * whose tags/specialty/subgroup overlap the extracted intent. Falls back to a
 * substring search when embeddings or the API key are unavailable.
 *
 * Requires an approved actor — preserves the original server action's
 * `requireUser()` gate (any logged-in user, not admin-only).
 */
export async function searchCases(actor: Actor | null, query: string): Promise<SerializedCase[]> {
  assertApproved(actor, 'Требуется авторизация.');

  const trimmed = query.trim();
  if (!trimmed) return [];

  // No API key → graceful substring fallback.
  if (!process.env.OPENAI_API_KEY) {
    try {
      return await fallbackSearchCases(trimmed);
    } catch (error) {
      console.error('searchCases fallback failed', error);
      throw new DomainError('Не удалось выполнить поиск.');
    }
  }

  try {
    // 1. Extract structured intent from the natural-language query.
    let intent: SearchIntent;
    try {
      intent = await extractSearchIntent(trimmed);
    } catch (error) {
      console.error('searchCases intent extraction failed, using raw query', error);
      intent = { refinedQuery: trimmed, tags: [], specialty: null, subgroup: null };
    }

    // 2. Embed the refined query.
    const queryVector = await embedText(intent.refinedQuery || trimmed);
    const literal = toVectorLiteral(queryVector);

    // 3. pgvector KNN over embedded cases.
    const knn = await prisma.$queryRaw<Array<{ id: string; distance: number }>>`
      SELECT id, (embedding <=> ${literal}::vector) AS distance
      FROM "Case"
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${literal}::vector
      LIMIT 20
    `;

    // No embedded cases yet → fall back to substring search.
    if (knn.length === 0) {
      return await fallbackSearchCases(trimmed);
    }

    const ids = knn.map((r) => r.id);
    const rows = await prisma.case.findMany({
      where: { id: { in: ids } },
      include: SEARCH_INCLUDE,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));

    // 4. Rank: combine semantic similarity with tag/specialty/subgroup boosts.
    const wantTags = new Set(intent.tags.map(normSearch).filter(Boolean));
    const wantSpecialty = intent.specialty ? normSearch(intent.specialty) : null;
    const wantSubgroup = intent.subgroup ? normSearch(intent.subgroup) : null;

    const scored = knn
      .map((r) => {
        const row = byId.get(r.id);
        if (!row) return null;
        // distance is cosine distance in [0,2]; similarity in roughly [-1,1].
        const similarity = 1 - Number(r.distance);
        let boost = 0;
        if (wantTags.size) {
          const rowTags = new Set((row.tags ?? []).map(normSearch));
          let overlap = 0;
          for (const t of wantTags) if (rowTags.has(t)) overlap += 1;
          boost += overlap * 0.15;
        }
        if (wantSpecialty && row.specialty && normSearch(row.specialty) === wantSpecialty) {
          boost += 0.2;
        }
        if (wantSubgroup && row.subgroup && normSearch(row.subgroup) === wantSubgroup) {
          boost += 0.1;
        }
        return { row, score: similarity + boost };
      })
      .filter((x): x is { row: (typeof rows)[number]; score: number } => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    return scored.map((s) => serializeCase(s.row));
  } catch (error) {
    console.error('searchCases failed, attempting fallback', error);
    try {
      return await fallbackSearchCases(trimmed);
    } catch (fallbackError) {
      console.error('searchCases fallback also failed', fallbackError);
      throw new DomainError('Не удалось выполнить поиск.');
    }
  }
}

export { embedText, buildCaseEmbeddingText, toVectorLiteral, upsertCaseEmbedding, reembedCase, markCaseDirty, hashEmbeddingText, EMBEDDING_MODEL, EMBEDDING_DIMS } from './embeddings';
