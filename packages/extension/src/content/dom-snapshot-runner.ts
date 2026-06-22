/**
 * In-page DOM snapshot read (S2-13).
 *
 * Returns the full `documentElement.outerHTML`. Kept self-contained (no imports, `document` default)
 * so the service worker can run it in the page via `chrome.scripting.executeScript`, which serializes
 * the function. Scrubbing (password masking, etc.) is applied to the returned string by the collector
 * (`../capture/dom-snapshot`) before it is stored.
 */
export function readDomOuterHtml(doc: Document = document): string {
  return doc.documentElement.outerHTML;
}
