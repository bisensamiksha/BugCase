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

/**
 * Pick the screenshot: a scroll-and-stitch full-page capture, falling back to the visible viewport if
 * stitching fails. Scroll-stitch works in every browser and reflects the user's actual (responsive)
 * viewport, so it's the screenshot path in all modes; the on-demand debugger (when opted in) is used
 * only for network response bodies, not screenshots.
 */
export async function captureScreenshotWithStrategy(
  deps: ScreenshotStrategyDeps,
): Promise<CapturedScreenshot> {
  try {
    return await deps.captureScrollStitch();
  } catch {
    // Scroll-stitch failed — fall back to the always-available viewport capture.
  }
  return deps.captureViewport();
}
