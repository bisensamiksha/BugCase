import {
  BUG_REPORT_ZIP_LAYOUT,
  type BugReportV1,
  type BugReportZipAssets,
  type CaptureMetadata,
  type ScreenshotsManifest,
  type UserInput,
} from '@bugcase/schema';

import type { VisibleTabCapture } from '../capture/capture-visible-tab';

import { buildCaptureReportFilename } from './downloads';

export interface CaptureFlowInput {
  readonly metadata: CaptureMetadata;
  readonly userInput: UserInput;
}

/** Injected effects so the orchestration is unit-testable without the browser. */
export interface CaptureFlowDeps {
  readonly captureScreenshot: () => Promise<VisibleTabCapture>;
  readonly writeZip: (report: BugReportV1, assets: BugReportZipAssets) => Promise<Blob>;
  readonly download: (blob: Blob, filename: string) => Promise<number>;
  readonly now?: () => Date;
}

export interface CaptureFlowResult {
  readonly ok: boolean;
  readonly downloadId?: number;
  readonly filename?: string;
  readonly byteSize?: number;
  readonly reason?: string;
}

function toReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * End-to-end capture: screenshot → assemble a `BugReportV1` (with metadata collected upstream
 * in the page context) → ZIP via the schema writer → download with a timestamped filename.
 * Runs in the service worker. Any failure (denied capture, download error) resolves to
 * `{ ok: false, reason }` rather than throwing.
 */
export async function runCaptureFlow(
  input: CaptureFlowInput,
  deps: CaptureFlowDeps,
): Promise<CaptureFlowResult> {
  try {
    const shot = await deps.captureScreenshot();

    const screenshots: ScreenshotsManifest = {
      schemaVersion: 'v1',
      viewport: {
        path: BUG_REPORT_ZIP_LAYOUT.screenshots.viewport,
        width: shot.width,
        height: shot.height,
        devicePixelRatio: shot.devicePixelRatio,
        captureMethod: shot.captureMethod,
        hasAnnotations: false,
      },
      elementCrops: [],
    };

    const report: BugReportV1 = {
      schemaVersion: 'v1',
      metadata: input.metadata,
      userInput: input.userInput,
      screenshots,
      browser: null,
      console: null,
      network: null,
      dom: null,
      storage: null,
      cookies: null,
      navigation: null,
      reproduction: null,
      elementInspections: null,
    };

    const assets: BugReportZipAssets = {
      files: new Map<string, Blob | string | Uint8Array>([
        [BUG_REPORT_ZIP_LAYOUT.screenshots.viewport, shot.blob],
      ]),
    };

    const zip = await deps.writeZip(report, assets);
    const filename = buildCaptureReportFilename(
      deps.now?.() ?? new Date(),
      input.metadata.page.origin,
    );
    const downloadId = await deps.download(zip, filename);

    return { ok: true, downloadId, filename, byteSize: zip.size };
  } catch (error) {
    return { ok: false, reason: toReason(error) };
  }
}
