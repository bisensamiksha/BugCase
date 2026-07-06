import { describe, expect, it, vi } from 'vitest';

import { captureScreenshotWithStrategy, type CapturedScreenshot } from './screenshot-strategy';

const shot = (captureMethod: CapturedScreenshot['captureMethod']): CapturedScreenshot => ({
  blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
  dataUrl: 'data:image/png;base64,AA==',
  width: 100,
  height: 200,
  devicePixelRatio: 1,
  captureMethod,
});

describe('captureScreenshotWithStrategy', () => {
  it('uses the scroll-stitch full-page capture when full page is chosen', async () => {
    const captureViewport = vi.fn(() => Promise.resolve(shot('visibleTab')));
    const result = await captureScreenshotWithStrategy(
      {
        captureScrollStitch: () => Promise.resolve(shot('scrollStitch')),
        captureViewport,
      },
      { preferFullPage: true },
    );
    expect(result.captureMethod).toBe('scrollStitch');
    expect(captureViewport).not.toHaveBeenCalled();
  });

  it('falls back to the viewport when scroll-stitch fails', async () => {
    const captureViewport = vi.fn(() => Promise.resolve(shot('visibleTab')));
    const result = await captureScreenshotWithStrategy(
      {
        captureScrollStitch: () => Promise.reject(new Error('quota')),
        captureViewport,
      },
      { preferFullPage: true },
    );
    expect(result.captureMethod).toBe('visibleTab');
    expect(captureViewport).toHaveBeenCalledTimes(1);
  });

  it('captures the visible viewport only (never full page) when full page is not chosen', async () => {
    const captureScrollStitch = vi.fn(() => Promise.resolve(shot('scrollStitch')));
    const result = await captureScreenshotWithStrategy(
      {
        captureScrollStitch,
        captureViewport: () => Promise.resolve(shot('visibleTab')),
      },
      { preferFullPage: false },
    );
    expect(result.captureMethod).toBe('visibleTab');
    expect(captureScrollStitch).not.toHaveBeenCalled();
  });
});
