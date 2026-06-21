import type { ScreenshotCaptureMethod } from '@bugcase/schema';

/** A captured screenshot in a form the capture flow can drop into the report manifest + ZIP. */
export interface CapturedScreenshot {
  readonly blob: Blob;
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
  readonly devicePixelRatio: number;
  readonly captureMethod: ScreenshotCaptureMethod;
}

export interface ScreenshotStrategyDeps {
  /** Whether to attempt the CDP full-page path (debugger available + opted in). */
  readonly preferFullPage: () => Promise<boolean>;
  /** Capture the whole page via CDP (attaches the debugger). */
  readonly captureFullPage: () => Promise<CapturedScreenshot>;
  /** Capture the whole page by scroll-and-stitch — the full-page path that needs no debugger. */
  readonly captureScrollStitch: () => Promise<CapturedScreenshot>;
  /** Capture the visible viewport — the always-available last resort. */
  readonly captureViewport: () => Promise<CapturedScreenshot>;
}

/**
 * Pick the best available screenshot, degrading gracefully:
 *   1. CDP full-page when the user opted into the debugger and it's available;
 *   2. otherwise scroll-and-stitch full-page (no debugger needed);
 *   3. otherwise the visible viewport.
 * Any failure at one level falls through to the next, so a capture always produces an image.
 */
export async function captureScreenshotWithStrategy(
  deps: ScreenshotStrategyDeps,
): Promise<CapturedScreenshot> {
  if (await deps.preferFullPage()) {
    try {
      return await deps.captureFullPage();
    } catch {
      // CDP full-page failed — try the scroll-stitch full-page path next.
    }
  }
  try {
    return await deps.captureScrollStitch();
  } catch {
    // Scroll-stitch failed — fall back to the always-available viewport capture.
  }
  return deps.captureViewport();
}
