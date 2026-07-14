import { prisma } from '@docjob/db';
import type { CaseBody } from '@docjob/types';
import { getOpenAI } from '../openai';

// Moved verbatim from apps/web/src/lib/embeddings.ts (SP-1b Task 4). The
// single importer, apps/web/src/app/actions.ts, now calls these through
// `@docjob/core` (`core.search.*` / `core.upsertCaseEmbedding`) instead.

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMS = 1536;

/**
 * Embed an arbitrary string into a 1536-dim vector using OpenAI's
 * text-embedding-3-small model (matches the `vector(1536)` column on Case).
 */
export async function embedText(text: string): Promise<number[]> {
  const input = text.trim().slice(0, 8000) || ' ';
  const res = await getOpenAI().embeddings.create({
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
 * Flatten a BlockNote document to plain text. Private copy of the same
 * algorithm as apps/web/src/lib/case-body-text.ts's `caseBodyToPlainText`
 * (kept as a separate, unexported copy here rather than shared, since that
 * web module also backs UI-facing case-preview rendering and is out of
 * scope for this relocation — core just needs the text for embedding).
 */
function caseBodyToPlainText(body: CaseBody | null | undefined): string {
  if (!body) return '';
  return blocksToText(extractBlocks(body));
}

function extractBlocks(body: CaseBody): unknown[] {
  if (!body || typeof body !== 'object') return [];
  if (Array.isArray(body)) return body;
  const blocks = (body as Record<string, unknown>).blocks;
  return Array.isArray(blocks) ? blocks : [];
}

function blocksToText(blocks: unknown[]): string {
  const out: string[] = [];
  for (const raw of blocks) {
    if (!raw || typeof raw !== 'object') continue;
    const block = raw as Record<string, unknown>;
    const content = inlineContentToText(block.content);
    if (content) out.push(content);
    const children = block.children;
    if (Array.isArray(children) && children.length) {
      out.push(blocksToText(children));
    }
  }
  return out.join(' ');
}

function inlineContentToText(content: unknown): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((c) => inlineContentToText(c)).join('');
  }
  if (typeof content === 'object') {
    const obj = content as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text;
    if (Array.isArray(obj.content)) return inlineContentToText(obj.content);
  }
  return '';
}

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
