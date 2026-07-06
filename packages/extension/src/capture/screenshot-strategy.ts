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
  /** Capture the whole page by scroll-and-stitch — the full-page path (no debugger needed). */
  readonly captureScrollStitch: () => Promise<CapturedScreenshot>;
  /** Capture the visible viewport — the always-available fallback. */
  readonly captureViewport: () => Promise<CapturedScreenshot>;
}

export interface ScreenshotStrategyOptions {
  /** When true, capture the whole page (scroll-stitch); otherwise capture only the visible viewport. */
  readonly preferFullPage: boolean;
}

/**
 * Pick the screenshot honoring the user's choice (S3-06 capture options): a full-page scroll-and-stitch
 * when full page is selected (falling back to the visible viewport if stitching fails), or the visible
 * viewport only when it is not. The on-demand debugger (when opted in) is used only for network response
 * bodies, not screenshots.
 */
export async function captureScreenshotWithStrategy(
  deps: ScreenshotStrategyDeps,
  options: ScreenshotStrategyOptions,
): Promise<CapturedScreenshot> {
  if (!options.preferFullPage) {
    return deps.captureViewport();
  }
  try {
    return await deps.captureScrollStitch();
  } catch {
    // Scroll-stitch failed — fall back to the always-available viewport capture.
  }
  return deps.captureViewport();
}
