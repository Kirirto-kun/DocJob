/**
 * `SearchHit.snippet` (`packages/core/src/search/lexical.ts`, via Postgres
 * `ts_headline`) is a short server-generated fragment of curated case text
 * containing only `<mark>`/`</mark>` around the matched terms — never
 * arbitrary HTML. The web client renders it with `dangerouslySetInnerHTML`
 * (`apps/web/src/app/ai-search/page.tsx`); there is no DOM/webview-free
 * equivalent on native, and the SP-4b Task 4 brief explicitly calls for
 * PLAIN text here (no webview just for a one-line snippet). This strips any
 * tag (not just `<mark>`, as defense-in-depth in case the server-side
 * headline format ever changes) and leaves the plain matched text.
 */
export function stripSnippetHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}
