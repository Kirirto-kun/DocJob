import { prisma } from '@docjob/db';
import { openai } from '@/lib/openai';
import { caseBodyToPlainText } from '@/lib/case-body-text';
import type { CaseBody } from '@/lib/case-schema';

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMS = 1536;

/**
 * Embed an arbitrary string into a 1536-dim vector using OpenAI's
 * text-embedding-3-small model (matches the `vector(1536)` column on Case).
 */
export async function embedText(text: string): Promise<number[]> {
  const input = text.trim().slice(0, 8000) || ' ';
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input,
  });
  const vector = res.data[0]?.embedding;
  if (!vector) throw new Error('OpenAI returned no embedding');
  return vector;
}

type EmbeddableCase = {
  name: string;
  teaser?: string | null;
  primaryCondition?: string | null;
  specialty?: string | null;
  subgroup?: string | null;
  tags?: string[] | null;
  body?: unknown;
};

/**
 * Concatenate the searchable text of a case: name + teaser + specialty +
 * tags + flattened BlockNote body. Reuses the shared body walker.
 */
export function buildCaseEmbeddingText(c: EmbeddableCase): string {
  const parts: string[] = [];
  if (c.name) parts.push(c.name);
  if (c.teaser) parts.push(c.teaser);
  if (c.primaryCondition) parts.push(c.primaryCondition);
  if (c.specialty) parts.push(c.specialty);
  if (c.subgroup) parts.push(c.subgroup);
  if (c.tags && c.tags.length) parts.push(c.tags.join(', '));
  const bodyText = caseBodyToPlainText((c.body as CaseBody) ?? null);
  if (bodyText) parts.push(bodyText);
  return parts.join('\n');
}

/**
 * Format a number[] as a pgvector literal: "[0.1,0.2,...]".
 */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

/**
 * Load a case, build its searchable text, embed it, and persist the vector.
 * Fully guarded: a missing OPENAI_API_KEY or any API/DB error is logged and
 * swallowed so callers (createCase/updateCase) are never broken by embedding.
 */
export async function upsertCaseEmbedding(caseId: string): Promise<void> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.warn('[embeddings] OPENAI_API_KEY missing — skipping embedding for case', caseId);
      return;
    }
    const c = await prisma.case.findUnique({
      where: { id: caseId },
      select: {
        name: true,
        teaser: true,
        primaryCondition: true,
        specialty: true,
        subgroup: true,
        tags: true,
        body: true,
      },
    });
    if (!c) {
      console.warn('[embeddings] case not found, skipping embedding', caseId);
      return;
    }
    const text = buildCaseEmbeddingText(c);
    const vector = await embedText(text);
    const literal = toVectorLiteral(vector);
    await prisma.$executeRaw`UPDATE "Case" SET embedding = ${literal}::vector WHERE id = ${caseId}`;
  } catch (error) {
    console.error('[embeddings] upsertCaseEmbedding failed for', caseId, error);
  }
}
