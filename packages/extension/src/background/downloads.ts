import browser from '../lib/browser';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Compact UTC timestamp `YYYYMMDD-HHmmss` — stable regardless of the runner's timezone. */
function utcStamp(now: Date): string {
  return (
    String(now.getUTCFullYear()) +
    pad2(now.getUTCMonth() + 1) +
    pad2(now.getUTCDate()) +
    '-' +
    pad2(now.getUTCHours()) +
    pad2(now.getUTCMinutes()) +
    pad2(now.getUTCSeconds())
  );
}

/** Slug of the page host for the filename; `capture` when the origin is missing/unparseable. */
function hostSlug(origin?: string): string {
  if (origin) {
    try {
      const slug = new URL(origin).hostname
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
      if (slug) {
        return slug;
      }
    } catch {
      // fall through to the default below
    }
  }
  return 'capture';
}

/** `bugcase-<host>-<YYYYMMDD-HHmmss>.zip`, e.g. `bugcase-example-com-20260613-090807.zip`. */
export function buildCaptureReportFilename(now: Date, origin?: string): string {
  return `bugcase-${hostSlug(origin)}-${utcStamp(now)}.zip`;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}

/**
 * Download a Blob via `chrome.downloads`. Uses a base64 data URL because MV3 service
 * workers cannot mint object URLs (`URL.createObjectURL` is unavailable there). Returns
 * the download id; rejections (e.g. downloads permission missing) are the caller's to handle.
 */
export async function downloadBlob(blob: Blob, filename: string): Promise<number> {
  const url = await blobToDataUrl(blob);
  return browser.downloads.download({ url, filename, saveAs: false });
}
