import type { BugReportV1 } from '@bugcase/schema';

import type { ReportSource } from '../lib/report-source';

/**
 * A no-op {@link ReportSource} wrapping a parsed report, for tests that inject the reader and only
 * exercise report-driven UI (not binary entry reads). Not part of the app bundle.
 */
export function fakeReportSource(report: BugReportV1): ReportSource {
  return {
    report,
    readText: () => Promise.resolve(null),
    readBlob: () => Promise.resolve(null),
    objectUrl: () => Promise.resolve(null),
    dispose: () => {},
  };
}
