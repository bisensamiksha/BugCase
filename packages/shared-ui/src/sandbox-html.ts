/**
 * Safe iframe source helpers for rendering captured DOM snapshots — the single security-critical
 * copy (S4-09), extracted from the extension preview (S3-04) and consumed by BOTH the extension
 * viewer and the dashboard DOM pane. A hardening fix here lands in every surface simultaneously;
 * never fork this logic back into a consumer.
 *
 * The snapshot is scrubbed `outerHTML` stored as text. To render it faithfully but safely we
 * (1) render it in an iframe whose `sandbox` grants nothing (no scripts, no same-origin), and
 * (2) wrap it in a `default-src 'none'` CSP so previewing a captured page cannot fetch remote
 * subresources or beacon out — privacy-first, no data leaves the browser.
 */

/**
 * Empty `sandbox` token list. An empty attribute applies every restriction: the iframe gets a
 * unique opaque origin and scripts are disabled. Adding any `allow-*` token would loosen it, so we
 * deliberately grant nothing here.
 */
export const DOM_SANDBOX = '';

/** Network-blocking policy for the snapshot iframe; inline styles + data: assets still render. */
export const SNAPSHOT_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:;";

const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${SNAPSHOT_CSP}">`;

/**
 * Wrap captured HTML for an iframe `srcDoc`: inject the network-blocking CSP into `<head>` (or
 * prepend it when there is no head) so no remote subresource loads while previewing.
 */
export function buildSandboxSrcDoc(html: string): string {
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${CSP_META}`);
  }
  return `${CSP_META}${html}`;
}
