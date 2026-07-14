import type { BugReportV1 } from '@bugcase/schema';
import type JSZip from 'jszip';

/**
 * Lazy data-access seam over a loaded report ZIP (S4-05). Keeps the JSZip handle so panes can read
 * entries (text/blob/object-URL) on demand instead of eagerly decompressing the whole archive — the
 * 50 MB budget depends on opening only touching `report.json`. Object URLs are created lazily, cached
 * per path, and revoked on {@link ReportSource.dispose}, which the App calls when a report tab closes
 * (otherwise the dashboard leaks one URL per requested entry per opened report).
 */
export interface ReportSource {
  readonly report: BugReportV1;
  /** Entry text, or `null` if the entry is absent (or the source is disposed). Never throws. */
  readText(path: string): Promise<string | null>;
  /** Entry bytes as a Blob, or `null` if absent/disposed. */
  readBlob(path: string): Promise<Blob | null>;
  /** Lazily-created, cached object URL for an entry, or `null` if absent/disposed. */
  objectUrl(path: string): Promise<string | null>;
  /** Revoke every created object URL and stop serving reads. Idempotent. */
  dispose(): void;
}

export function createReportSource(zip: JSZip, report: BugReportV1): ReportSource {
  const urlCache = new Map<string, string>();
  let disposed = false;

  async function readBlob(path: string): Promise<Blob | null> {
    if (disposed) {
      return null;
    }
    const file = zip.file(path);
    if (!file) {
      return null;
    }
    // Build the Blob from bytes rather than JSZip's optional `blob` output so it works uniformly
    // across the browser, jsdom, and Node test environments.
    const buffer = await file.async('arraybuffer');
    return new Blob([buffer]);
  }

  return {
    report,

    async readText(path: string): Promise<string | null> {
      if (disposed) {
        return null;
      }
      const file = zip.file(path);
      return file ? file.async('string') : null;
    },

    readBlob,

    async objectUrl(path: string): Promise<string | null> {
      if (disposed) {
        return null;
      }
      const cached = urlCache.get(path);
      if (cached !== undefined) {
        return cached;
      }
      const blob = await readBlob(path);
      if (!blob) {
        return null;
      }
      const url = URL.createObjectURL(blob);
      urlCache.set(path, url);
      return url;
    },

    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const url of urlCache.values()) {
        URL.revokeObjectURL(url);
      }
      urlCache.clear();
    },
  };
}
