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
  /** Capture the visible viewport — the always-available default and fallback. */
  readonly captureViewport: () => Promise<CapturedScreenshot>;
}

/**
 * Pick the best available screenshot: the CDP full-page capture when the user has opted in and it's
 * available, otherwise the viewport capture. Any full-page failure (disabled, unavailable, attach
 * error) transparently falls back to the viewport so a capture always produces an image.
 *
 * The viewport scroll-stitch fallback is added in S2-12.
 */
export async function captureScreenshotWithStrategy(
  deps: ScreenshotStrategyDeps,
): Promise<CapturedScreenshot> {
  if (await deps.preferFullPage()) {
    try {
      return await deps.captureFullPage();
    } catch {
      // Full-page CDP capture failed — fall through to the always-available viewport capture.
    }
  }
  return deps.captureViewport();
}
