/**
 * Report-ZIP assertion helpers (S2-23).
 *
 * Small, dependency-light utilities for inspecting a BugCase report ZIP in an E2E test. The capture
 * flow downloads the ZIP as a `data:` URL (Blobs can't cross the runtime-message boundary), so tests
 * decode that URL and read entries. Kept free of `@bugcase/*` runtime imports so it loads cleanly in
 * the Playwright runner; canonical entry paths are passed in by the caller as string literals.
 */

import JSZip from 'jszip';

/** Canonical entry paths (mirrors `BUG_REPORT_ZIP_LAYOUT`; duplicated here to avoid a runtime import). */
export const REPORT_ZIP_PATHS = {
  report: 'report.json',
  metadata: 'metadata.json',
  viewportScreenshot: 'screenshots/viewport.png',
} as const;

/** A `chrome.downloads.download` call captured by the test's worker stub. */
export interface CapturedDownload {
  readonly url: string;
  readonly filename: string;
}

/** Decode a `data:` URL download (base64 payload) into a parsed JSZip archive. */
export async function zipFromDataUrl(dataUrl: string): Promise<JSZip> {
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma === -1) {
    throw new Error('not a data: URL download');
  }
  const base64 = dataUrl.slice(comma + 1);
  return JSZip.loadAsync(Buffer.from(base64, 'base64'));
}

/** True when the archive contains an entry at `path`. */
export function hasEntry(zip: JSZip, path: string): boolean {
  return zip.file(path) !== null;
}

/** Read an entry as text, throwing a clear error if it is missing. */
export async function readTextEntry(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path);
  if (!file) {
    throw new Error(`report ZIP is missing ${path}`);
  }
  return file.async('string');
}

/** Read and JSON-parse an entry. */
export async function readJsonEntry<T>(zip: JSZip, path: string): Promise<T> {
  return JSON.parse(await readTextEntry(zip, path)) as T;
}
