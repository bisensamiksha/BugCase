import type { BugReportV1, ScreenshotRef } from '@bugcase/schema';

/** The single screenshot the preview shows: viewport, else fullPage, else the first element crop. */
export function resolveScreenshot(report: BugReportV1): ScreenshotRef | null {
  const s = report.screenshots;
  return s.viewport ?? s.fullPage ?? s.elementCrops[0] ?? null;
}
