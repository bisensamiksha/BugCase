/**
 * Full-page screenshot via CDP (S2-11).
 *
 * Uses an attached {@link DebuggerSession} (S2-10) to run `Page.captureScreenshot` with
 * `captureBeyondViewport` + `fromSurface`, which captures the whole scrollable page in one shot —
 * something `tabs.captureVisibleTab` (viewport only) cannot do. Decodes the base64 PNG into a sized
 * Blob, reusing the package's PNG helpers so no image decoder is needed.
 */

import { dataUrlToBlob, readPngDimensions } from '../capture/capture-visible-tab';

import type { DebuggerSession } from './debugger-session';

export interface FullPageScreenshot {
  readonly blob: Blob;
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
  readonly devicePixelRatio: number;
  readonly captureMethod: 'cdpFullPage';
}

export interface FullPageScreenshotOptions {
  /** Stamped onto the result; CDP screenshots don't report DPR, so the caller supplies it. */
  readonly devicePixelRatio: number;
}

interface CaptureScreenshotResult {
  readonly data?: string;
}

/**
 * Capture the full page through CDP. Rejects if the command returns no data; the caller (the
 * screenshot strategy) handles that by falling back to a viewport capture.
 */
export async function captureFullPageScreenshot(
  session: DebuggerSession,
  options: FullPageScreenshotOptions,
): Promise<FullPageScreenshot> {
  const result = (await session.sendCommand('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    fromSurface: true,
  })) as CaptureScreenshotResult;

  if (!result?.data) {
    throw new Error('Page.captureScreenshot returned no image data');
  }

  const dataUrl = `data:image/png;base64,${result.data}`;
  const blob = dataUrlToBlob(dataUrl);
  const { width, height } = readPngDimensions(new Uint8Array(await blob.arrayBuffer()));

  return {
    blob,
    dataUrl,
    width,
    height,
    devicePixelRatio: options.devicePixelRatio,
    captureMethod: 'cdpFullPage',
  };
}
