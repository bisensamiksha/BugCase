import type { BugReportV1, BugReportZipAssets } from '@bugcase/schema';

export interface HeldReport {
  readonly report: BugReportV1;
  readonly assets: BugReportZipAssets;
}

export interface ReportHold {
  /** Store a captured report + assets; returns its `reportId`. */
  put(held: HeldReport): string;
  /** Retrieve and remove a held report (one-shot); `undefined` if absent/evicted. */
  take(reportId: string): HeldReport | undefined;
  /** Retrieve a held report without removing it; `undefined` if absent/evicted. */
  peek(reportId: string): HeldReport | undefined;
}

/**
 * In-memory hold for a captured report between CAPTURE_REPORT and FINALIZE_REPORT. The MV3
 * service worker may be evicted between the two messages; a missing `reportId` then means
 * "expired", which the finalize handler reports back so the overlay can offer a re-capture.
 */
export function createReportHold(generateId: () => string = () => crypto.randomUUID()): ReportHold {
  const store = new Map<string, HeldReport>();
  return {
    put(value) {
      const id = generateId();
      store.set(id, value);
      return id;
    },
    take(reportId) {
      const value = store.get(reportId);
      if (value) {
        store.delete(reportId);
      }
      return value;
    },
    peek(reportId) {
      return store.get(reportId);
    },
  };
}
