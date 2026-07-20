import { base64ToBytes, type InlineReportPayload } from '@bugcase/schema';

import type { ReportSource } from './report-source';

/**
 * A {@link ReportSource} over an inlined report.html payload (S4-15): assets come from base64 in
 * `window.__BUG_REPORT__` instead of a ZIP. Mirrors `createReportSource` so every pane works unchanged.
 */
export function createInlineReportSource(payload: InlineReportPayload): ReportSource {
  const urlCache = new Map<string, string>();
  let disposed = false;

  function bytesFor(path: string): Uint8Array | null {
    const b64 = payload.assets[path];
    return b64 === undefined ? null : base64ToBytes(b64);
  }

  // Reads are synchronous (base64 decode) but the ReportSource contract is Promise-based, so wrap.
  return {
    report: payload.report,

    readText(path: string): Promise<string | null> {
      if (disposed) {
        return Promise.resolve(null);
      }
      const bytes = bytesFor(path);
      return Promise.resolve(bytes ? new TextDecoder().decode(bytes) : null);
    },

    readBlob(path: string): Promise<Blob | null> {
      if (disposed) {
        return Promise.resolve(null);
      }
      const bytes = bytesFor(path);
      return Promise.resolve(bytes ? new Blob([bytes as BlobPart]) : null);
    },

    objectUrl(path: string): Promise<string | null> {
      if (disposed) {
        return Promise.resolve(null);
      }
      const cached = urlCache.get(path);
      if (cached !== undefined) {
        return Promise.resolve(cached);
      }
      const bytes = bytesFor(path);
      if (!bytes) {
        return Promise.resolve(null);
      }
      const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
      urlCache.set(path, url);
      return Promise.resolve(url);
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
