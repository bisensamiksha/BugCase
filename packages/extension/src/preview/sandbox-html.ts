/**
 * DOM-snapshot iframe safety for the preview viewer (S3-04).
 *
 * The security-critical sandbox/CSP logic lives in `@bugcase/shared-ui` (`sandbox-html.ts`) as the
 * single copy shared with the dashboard DOM pane (S4-09) — never fork it back here. This module
 * re-exports it for the viewer and keeps only the SW peek-bridge transport decoding, which is
 * extension-specific (the held snapshot arrives as a `data:text/plain;base64,…` URL).
 */

export { DOM_SANDBOX, buildSandboxSrcDoc } from '@bugcase/shared-ui';

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
