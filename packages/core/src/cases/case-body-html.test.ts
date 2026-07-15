import { describe, it, expect } from 'vitest';
import { caseBodyToHtml } from './case-body-html';

describe('caseBodyToHtml', () => {
  it('renders headings, paragraphs, and escapes text', () => {
    const body = { blocks: [
      { type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: 'Диагноз', styles: {} }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'a < b & c', styles: {} }] },
    ] };
    const html = caseBodyToHtml(body as any);
    expect(html).toContain('<h2>Диагноз</h2>');
    expect(html).toContain('a &lt; b &amp; c');
  });

  it('renders bold/italic/link inline marks', () => {
    const body = { blocks: [
      { type: 'paragraph', content: [
        { type: 'text', text: 'bold', styles: { bold: true } },
        { type: 'text', text: ' plain ', styles: {} },
        { type: 'link', href: 'https://x.test', content: [{ type: 'text', text: 'link', styles: {} }] },
      ] },
    ] };
    const html = caseBodyToHtml(body as any);
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<a href="https://x.test">link</a>');
  });

  it('groups consecutive list items into a single list', () => {
    const body = { blocks: [
      { type: 'bulletListItem', content: [{ type: 'text', text: 'one', styles: {} }] },
      { type: 'bulletListItem', content: [{ type: 'text', text: 'two', styles: {} }] },
    ] };
    const html = caseBodyToHtml(body as any);
    expect(html).toMatch(/<ul>\s*<li>one<\/li>\s*<li>two<\/li>\s*<\/ul>/);
  });

  it('neutralizes a script payload in text (no executable tag survives)', () => {
    const body = { blocks: [{ type: 'paragraph', content: [{ type: 'text', text: '<script>alert(1)</script>', styles: {} }] }] };
    const html = caseBodyToHtml(body as any);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes image url/alt attributes', () => {
    const body = { blocks: [{ type: 'image', props: { url: '/api/images/x.png"onerror="alert(1)', caption: 'a"b' } }] };
    const html = caseBodyToHtml(body as any);
    expect(html).not.toContain('onerror="alert');
    expect(html).toContain('&quot;');
  });

  it('returns empty string for empty/absent body', () => {
    expect(caseBodyToHtml({ blocks: [] } as any)).toBe('');
    expect(caseBodyToHtml(null)).toBe('');
    expect(caseBodyToHtml(undefined)).toBe('');
  });

  it('strips a javascript: link href but keeps the visible text', () => {
    const body = { blocks: [
      { type: 'paragraph', content: [
        { type: 'link', href: 'javascript:alert(1)', content: [{ type: 'text', text: 'click', styles: {} }] },
      ] },
    ] };
    const html = caseBodyToHtml(body as any);
    expect(html).toContain('click');
    expect(html).not.toContain('href');
    expect(html).not.toContain('javascript:');
  });

  it('keeps a normal https link as an anchor', () => {
    const body = { blocks: [
      { type: 'paragraph', content: [
        { type: 'link', href: 'https://x.test', content: [{ type: 'text', text: 'link', styles: {} }] },
      ] },
    ] };
    const html = caseBodyToHtml(body as any);
    expect(html).toContain('<a href="https://x.test">');
  });

  it('omits an <img> with a javascript: src but renders one with a safe relative src', () => {
    const dangerous = { blocks: [{ type: 'image', props: { url: 'javascript:alert(1)', caption: 'x' } }] };
    expect(caseBodyToHtml(dangerous as any)).not.toContain('<img');

    const safe = { blocks: [{ type: 'image', props: { url: '/api/images/x.png', caption: 'x' } }] };
    expect(caseBodyToHtml(safe as any)).toContain('<img');
  });
});
