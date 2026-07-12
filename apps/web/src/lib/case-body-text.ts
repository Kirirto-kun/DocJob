import type { CaseBody } from '@/lib/case-schema';

export function caseBodyToPlainText(body: CaseBody | null | undefined): string {
  if (!body) return '';
  return blocksToText(extractBlocks(body));
}

export function caseBodyPreview(body: CaseBody | null | undefined, maxLen = 140): string {
  const text = caseBodyToPlainText(body).replace(/\s+/g, ' ').trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
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
