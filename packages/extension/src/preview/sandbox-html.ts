/**
 * Safe iframe source helper for the DOM-snapshot viewer (S3-04).
 *
 * The held DOM snapshot is scrubbed `outerHTML` stored as text and surfaced by the SW peek bridge
 * as a `data:text/plain;base64,…` URL. To render it faithfully but safely we (1) decode it back to
 * the raw HTML string, (2) render it in an iframe whose `sandbox` grants nothing (no scripts, no
 * same-origin), and (3) wrap it in a `default-src 'none'` CSP so previewing a captured page cannot
 * fetch remote subresources or beacon out — privacy-first, no data leaves the browser.
 */

/**
 * Empty `sandbox` token list. An empty attribute applies every restriction: the iframe gets a
 * unique opaque origin and scripts are disabled. Adding any `allow-*` token would loosen it, so we
 * deliberately grant nothing here.
 */
export const DOM_SANDBOX = '';

/** Network-blocking policy for the snapshot iframe; inline styles + data: assets still render. */
const SNAPSHOT_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:;";

const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${SNAPSHOT_CSP}">`;

/**
 * Decode a `data:` URL (as returned by the SW peek bridge) back into its text payload. Handles the
 * base64 form (`data:…;base64,…`, UTF-8 aware) and the URL-encoded form. Throws on a non-data URL.
 */
export function decodeDataUrlText(dataUrl: string): string {
  const match = /^data:([^,]*),([\s\S]*)$/.exec(dataUrl);
  if (!match) {
    throw new Error('Not a data URL');
  }
  const meta = match[1] ?? '';
  const payload = match[2] ?? '';
  if (/;base64/i.test(meta)) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }
  return decodeURIComponent(payload);
}

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
