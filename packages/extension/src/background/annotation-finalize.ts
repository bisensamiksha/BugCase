import type { BugReportV1 } from '@bugcase/schema';

import { buildAnnotationFile } from '../annotation/konva-serialization';
import { dataUrlToBlob } from '../capture/capture-visible-tab';

import type { AnnotationExport } from './capture-flow';
import type { FinalizeAnnotationPayload } from './messages';

/** The ZIP path of the report's primary screenshot (viewport preferred, else full-page); `null` if none. */
export function resolveScreenshotPath(report: BugReportV1): string | null {
  return report.screenshots.viewport?.path ?? report.screenshots.fullPage?.path ?? null;
}

/**
 * Turn a finalize-message annotation payload into the {@link AnnotationExport} the ZIP step applies:
 * rehydrate the flattened PNG data URL to a Blob and wrap the Konva JSON as an `AnnotationFile`. Returns
 * `null` when the report has no screenshot to annotate. `toBlob` is injectable for tests.
 */
export function buildAnnotationExport(
  report: BugReportV1,
  payload: FinalizeAnnotationPayload,
  toBlob: (dataUrl: string) => Blob = dataUrlToBlob,
): AnnotationExport | null {
  const screenshotPath = resolveScreenshotPath(report);
  if (!screenshotPath) {
    return null;
  }
  return {
    screenshotPath,
    annotatedScreenshot: toBlob(payload.screenshotDataUrl),
    annotationFile: buildAnnotationFile(screenshotPath, payload.konvaJson),
  };
}
