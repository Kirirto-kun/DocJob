import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { API_BASE_URL } from '../lib/config';
import { colors } from '../theme/colors';

type CaseBodyWebViewProps = {
  html: string;
};

/**
 * Renders `SerializedCase.bodyHtml` (server-rendered from the BlockNote
 * `body` via `caseBodyToHtml`, `packages/core/src/cases/case-body-html.ts`)
 * — there is no BlockNote React renderer available on native, so the case
 * body ships as pre-rendered HTML and this is the one place a webview is
 * used for actual document content (contrast with the search snippet, which
 * is deliberately plain text — see `../lib/html-text.ts`).
 *
 * Security (SP-4b Task 4 brief): `bodyHtml` is generated server-side from a
 * structured BlockNote document (not raw user HTML) and is already
 * XSS-escaped at that layer, but this view keeps two independent layers of
 * defense-in-depth on top regardless:
 *   - `javaScriptEnabled={false}` — no script execution inside the webview
 *     at all, so even a hypothetical injected `<script>` tag is inert.
 *   - `originWhitelist={['about:blank']}` — `source={{ html }}` (no `uri`)
 *     loads as the `about:blank` origin; whitelisting only that origin
 *     blocks the webview from ever navigating to (or loading a subresource
 *     from) any other origin a malicious link/redirect inside the body
 *     might point at.
 *
 * Sizing: with JS disabled there is no way to `postMessage` the rendered
 * content's height back to RN (the usual trick for an auto-sizing webview),
 * so this renders inside a fixed-height frame with its own native scroll
 * instead of expanding to fit inside the screen's outer ScrollView. Known,
 * accepted UX limitation for this task — see the Task 4 report.
 */
export function CaseBodyWebView({ html }: CaseBodyWebViewProps) {
  return (
    <View style={styles.container} testID="case-body-webview-container">
      <WebView
        testID="case-body-webview"
        originWhitelist={['about:blank']}
        javaScriptEnabled={false}
        source={{ html: wrapCaseBodyHtml(html) }}
        style={styles.webview}
      />
    </View>
  );
}

/**
 * Wraps the server-rendered body fragment in a minimal standalone HTML
 * document with an inline `<style>` so the case text is readable against
 * the app's own dark background (`app.json`'s `userInterfaceStyle: "dark"`
 * — matches every other screen's deep-space-blue/cyan dark theme, see
 * `../theme/colors.ts`) rather than relying on (or fighting) the OS-level
 * dark-mode auto-inversion some WebView implementations apply to un-styled
 * content.
 *
 * Review fix (whole-branch review, Minor): `source={{ html }}` loads this
 * document at the `about:blank` origin with no base URL, so a case body
 * embedding an image via a server-relative path (e.g.
 * `<img src="/api/images/...">`, the same relative shape `resolveMediaUrl`
 * (`../lib/config.ts`) resolves for native `<Image>` elsewhere in the app)
 * has nothing to resolve against and silently fails to load. Injecting
 * `<base href="${API_BASE_URL}/">` gives the document an origin to resolve
 * relative subresource URLs against, same as a browser tab actually
 * navigated to that origin would. This only fixes PUBLIC inline images
 * (`/api/images/*`, no auth required — see `apps/web/src/app/api/images/*`);
 * body images stored under `/api/attachments/*` require a `Bearer` header
 * this webview has no way to attach to an `<img>` subresource request, so
 * those still won't render on mobile. That's a known, documented limitation
 * left for a future signed-URL or Bearer-proxy pass — out of scope here.
 * `javaScriptEnabled={false}` and `originWhitelist` above are unaffected: a
 * `<base>` tag only changes how relative URLs resolve, it does not grant
 * navigation or script execution on the new origin.
 */
export function wrapCaseBodyHtml(bodyHtml: string): string {
  return `<!DOCTYPE html><html><head><base href="${API_BASE_URL}/" /><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" /><style>
    :root { color-scheme: dark; }
    body { margin: 0; padding: 16px; background: ${colors.background}; color: ${colors.text}; font-family: -apple-system, Roboto, sans-serif; font-size: 16px; line-height: 1.55; }
    h1, h2, h3, h4 { color: ${colors.text}; line-height: 1.3; }
    p { margin: 0 0 12px; }
    a { color: ${colors.primary}; }
    img { max-width: 100%; height: auto; border-radius: 6px; }
    ul, ol { padding-left: 20px; }
    table { width: 100%; border-collapse: collapse; }
    td, th { border: 1px solid ${colors.border}; padding: 6px; text-align: left; }
    blockquote { margin: 0 0 12px; padding-left: 12px; border-left: 3px solid ${colors.border}; color: ${colors.textMuted}; }
    mark { background: rgba(34,211,238,0.25); color: inherit; }
  </style></head><body>${bodyHtml}</body></html>`;
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 16,
  },
  webview: {
    height: 480,
    backgroundColor: colors.background,
  },
});
