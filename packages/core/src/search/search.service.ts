import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { prisma, type Prisma } from '@docjob/db';
import { assertApproved, type Actor } from '../shared/actor';
import { DomainError } from '../shared/errors';
import { serializeCase, type SerializedCase } from '../cases/case.mapper';
import { getOpenAI, DEFAULT_OPENAI_MODEL } from '../openai';
import { embedText, toVectorLiteral } from './embeddings';
import { reciprocalRankFusion, type SearchHit, type MatchSignal } from './fusion';
import { lexicalSearch } from './lexical';

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

const VECTOR_OVERFETCH = 50;
const LEXICAL_OVERFETCH = 50;
const RESULT_LIMIT = 12;

/** Over-fetched vector KNN (no WHERE filter, to protect HNSW recall). */
async function vectorSearchIds(refinedQuery: string): Promise<string[]> {
  const vector = await embedText(refinedQuery);
  const literal = toVectorLiteral(vector);
  const knn = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Case"
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${literal}::vector
    LIMIT ${VECTOR_OVERFETCH}
  `;
  return knn.map((r) => r.id);
}

/**
 * Hybrid search: runs a lexical arm (FTS+trigram on the RAW query — always,
 * even with no OpenAI key) and a semantic arm (embedding of the LLM-refined
 * query) in parallel, fuses them with RRF, applies intent-derived
 * tag/specialty/subgroup boosts, and returns ranked SearchHits. The LLM is
 * used ONLY for query understanding; returned cases are curated library
 * content (never generated). Degrades gracefully: OpenAI down → lexical-only;
 * lexical error too → substring fallback. On a genuinely broken search (e.g.
 * a total DB outage, so even the substring fallback can't run) it throws a
 * user-safe `DomainError` rather than leaking a raw Prisma error.
 */
export async function searchCases(actor: Actor | null, query: string): Promise<SearchHit[]> {
  assertApproved(actor, 'Требуется авторизация.');
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Intent extraction is best-effort; raw query is the floor.
  let intent: SearchIntent = { refinedQuery: trimmed, tags: [], specialty: null, subgroup: null };
  const hasKey = Boolean(process.env.OPENAI_API_KEY);
  if (hasKey) {
    try {
      intent = await extractSearchIntent(trimmed);
    } catch (error) {
      console.error('searchCases intent extraction failed, using raw query', error);
    }
  }

  // Run both arms in parallel; each degrades to [] on its own failure.
  const [lexHits, vecIds] = await Promise.all([
    lexicalSearch(trimmed, LEXICAL_OVERFETCH).catch((e) => {
      console.error('lexical arm failed', e);
      return [] as Array<{ id: string; snippet: string | null }>;
    }),
    hasKey
      ? vectorSearchIds(intent.refinedQuery || trimmed).catch((e) => {
          console.error('vector arm failed', e);
          return [] as string[];
        })
      : Promise.resolve<string[]>([]),
  ]);

  const lexIds = lexHits.map((h) => h.id);
  const snippetById = new Map(lexHits.map((h) => [h.id, h.snippet]));

  try {
    // Both arms empty → last-ditch substring fallback (keeps the old contract).
    if (lexIds.length === 0 && vecIds.length === 0) {
      console.warn('searchCases: both arms empty, substring fallback', { query: trimmed });
      const rows = await fallbackSearchCases(trimmed);
      if (rows.length === 0) console.warn('searchCases zero-result', { query: trimmed });
      return rows.map((c) => ({ case: c, score: 0, matchedVia: [] as MatchSignal[], snippet: null }));
    }

    const fused = reciprocalRankFusion([vecIds, lexIds]);
    const lexSet = new Set(lexIds);
    const vecSet = new Set(vecIds);

    // Load every candidate row once.
    const candidateIds = [...fused.keys()];
    const rows = await prisma.case.findMany({ where: { id: { in: candidateIds } }, include: SEARCH_INCLUDE });
    const byId = new Map(rows.map((r) => [r.id, r]));

    // Intent boosts (additive on top of the RRF score).
    const wantTags = new Set(intent.tags.map(normSearch).filter(Boolean));
    const wantSpecialty = intent.specialty ? normSearch(intent.specialty) : null;
    const wantSubgroup = intent.subgroup ? normSearch(intent.subgroup) : null;

    const scored: SearchHit[] = candidateIds
      .map((id): SearchHit | null => {
        const row = byId.get(id);
        if (!row) return null;
        let score = fused.get(id) ?? 0;
        if (wantTags.size) {
          const rowTags = new Set((row.tags ?? []).map(normSearch));
          let overlap = 0;
          for (const t of wantTags) if (rowTags.has(t)) overlap += 1;
          score += overlap * 0.01;
        }
        if (wantSpecialty && row.specialty && normSearch(row.specialty) === wantSpecialty) score += 0.015;
        if (wantSubgroup && row.subgroup && normSearch(row.subgroup) === wantSubgroup) score += 0.008;
        const matchedVia: MatchSignal[] = [];
        if (vecSet.has(id)) matchedVia.push('semantic');
        if (lexSet.has(id)) matchedVia.push('lexical');
        return { case: serializeCase(row), score, matchedVia, snippet: snippetById.get(id) ?? null };
      })
      .filter((x): x is SearchHit => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, RESULT_LIMIT);

    if (scored.length === 0) console.warn('searchCases zero-result', { query: trimmed });
    return scored;
  } catch (error) {
    console.error('searchCases failed', error);
    throw new DomainError('Не удалось выполнить поиск.');
  }
}

export { embedText, buildCaseEmbeddingText, toVectorLiteral, upsertCaseEmbedding, reembedCase, EMBEDDING_MODEL, EMBEDDING_DIMS } from './embeddings';
export { reciprocalRankFusion } from './fusion';
export type { SearchHit, MatchSignal } from './fusion';
export { lexicalSearch } from './lexical';
