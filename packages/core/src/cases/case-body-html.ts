import type { CaseBody } from '@docjob/types';

/**
 * Pure server-side BlockNote-JSON -> HTML renderer. No I/O, no React —
 * intended for a mobile client (react-native-webview) that has no BlockNote
 * React renderer available. Mirrors the traversal structure of the plain-text
 * walker in ../search/embeddings.ts (`caseBodyToPlainText`/`extractBlocks`/
 * `blocksToText`/`inlineContentToText`) but emits HTML instead of flattened
 * text, and groups consecutive list-item blocks into a single <ul>/<ol>.
 *
 * Security: ALL text and ALL attribute values are HTML-escaped via `esc()`
 * (order matters: `&` first, then `<`, `>`, `"`) — a case body containing
 * `<script>` must render as inert escaped text, never as a live tag.
 */

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function extractBlocks(body: CaseBody): unknown[] {
  if (!body || typeof body !== 'object') return [];
  if (Array.isArray(body)) return body;
  const blocks = (body as Record<string, unknown>).blocks;
  return Array.isArray(blocks) ? blocks : [];
}

/** Render inline content (string | inline-item | array of either) to an HTML fragment. */
function inlineContentToHtml(content: unknown): string {
  if (!content) return '';
  if (typeof content === 'string') return esc(content);
  if (Array.isArray(content)) {
    return content.map((c) => inlineContentToHtml(c)).join('');
  }
  if (typeof content === 'object') {
    const obj = content as Record<string, unknown>;

    if (obj.type === 'link') {
      const href = typeof obj.href === 'string' ? obj.href : '';
      const inner = inlineContentToHtml(obj.content);
      return `<a href="${esc(href)}">${inner}</a>`;
    }

    if (typeof obj.text === 'string') {
      let out = esc(obj.text);
      const styles = (obj.styles && typeof obj.styles === 'object') ? (obj.styles as Record<string, unknown>) : {};
      if (styles.code) out = `<code>${out}</code>`;
      if (styles.strike) out = `<s>${out}</s>`;
      if (styles.underline) out = `<u>${out}</u>`;
      if (styles.italic) out = `<em>${out}</em>`;
      if (styles.bold) out = `<strong>${out}</strong>`;
      return out;
    }

    if (Array.isArray(obj.content)) return inlineContentToHtml(obj.content);
  }
  return '';
}

function headingTag(level: unknown): 'h1' | 'h2' | 'h3' {
  const n = typeof level === 'number' ? level : Number(level);
  if (n === 1) return 'h1';
  if (n === 3) return 'h3';
  return 'h2';
}

function renderTableBlock(block: Record<string, unknown>): string {
  const props = (block.props && typeof block.props === 'object') ? (block.props as Record<string, unknown>) : {};
  const tableContent = (block.content && typeof block.content === 'object')
    ? (block.content as Record<string, unknown>)
    : props;
  const rows = Array.isArray((tableContent as Record<string, unknown>).rows)
    ? ((tableContent as Record<string, unknown>).rows as unknown[])
    : [];

  const rowsHtml = rows.map((raw) => {
    if (!raw || typeof raw !== 'object') return '<tr></tr>';
    const row = raw as Record<string, unknown>;
    const cells = Array.isArray(row.cells) ? row.cells : [];
    const cellsHtml = cells.map((cell) => `<td>${inlineContentToHtml(cell)}</td>`).join('');
    return `<tr>${cellsHtml}</tr>`;
  }).join('');

  return `<table>${rowsHtml}</table>`;
}

const LIST_BLOCK_TAGS: Record<string, string> = {
  bulletListItem: 'ul',
  numberedListItem: 'ol',
};

/** Render a run of blocks to HTML, grouping consecutive same-type list items into one list. */
function blocksToHtml(blocks: unknown[]): string {
  const out: string[] = [];
  let i = 0;

  while (i < blocks.length) {
    const raw = blocks[i];
    if (!raw || typeof raw !== 'object') {
      i++;
      continue;
    }
    const block = raw as Record<string, unknown>;
    const type = typeof block.type === 'string' ? block.type : '';
    const listTag = LIST_BLOCK_TAGS[type];

    if (listTag) {
      const items: string[] = [];
      while (i < blocks.length) {
        const listRaw = blocks[i];
        if (!listRaw || typeof listRaw !== 'object') break;
        const listBlock = listRaw as Record<string, unknown>;
        if (listBlock.type !== type) break;
        items.push(renderListItem(listBlock));
        i++;
      }
      out.push(`<${listTag}>${items.join('')}</${listTag}>`);
      continue;
    }

    out.push(renderBlock(block, type));
    i++;
  }

  return out.join('');
}

function renderListItem(block: Record<string, unknown>): string {
  const inner = inlineContentToHtml(block.content) + renderChildren(block);
  return `<li>${inner}</li>`;
}

function renderChildren(block: Record<string, unknown>): string {
  const children = block.children;
  return Array.isArray(children) && children.length ? blocksToHtml(children) : '';
}

function renderBlock(block: Record<string, unknown>, type: string): string {
  switch (type) {
    case 'paragraph': {
      return `<p>${inlineContentToHtml(block.content)}</p>` + renderChildren(block);
    }
    case 'heading': {
      const props = (block.props && typeof block.props === 'object') ? (block.props as Record<string, unknown>) : {};
      const tag = headingTag(props.level);
      return `<${tag}>${inlineContentToHtml(block.content)}</${tag}>` + renderChildren(block);
    }
    case 'checkListItem': {
      const props = (block.props && typeof block.props === 'object') ? (block.props as Record<string, unknown>) : {};
      const checked = Boolean(props.checked);
      const checkbox = `<input type="checkbox" disabled${checked ? ' checked' : ''}>`;
      return `<li>${checkbox}${inlineContentToHtml(block.content)}</li>` + renderChildren(block);
    }
    case 'image': {
      const props = (block.props && typeof block.props === 'object') ? (block.props as Record<string, unknown>) : {};
      const url = typeof props.url === 'string' ? props.url : '';
      const caption = typeof props.caption === 'string' ? props.caption : '';
      return `<img src="${esc(url)}" alt="${esc(caption)}">`;
    }
    case 'table': {
      return renderTableBlock(block);
    }
    default: {
      // Unknown block type: never silently drop content — render its
      // inline text (and any nested children) inside a plain <p>.
      const text = inlineContentToHtml(block.content);
      const childrenHtml = renderChildren(block);
      return text ? `<p>${text}</p>${childrenHtml}` : childrenHtml;
    }
  }
}

export function caseBodyToHtml(body: CaseBody | null | undefined): string {
  if (!body) return '';
  return blocksToHtml(extractBlocks(body));
}
