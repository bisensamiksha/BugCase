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
  it('uses the CDP full-page capture when preferred', async () => {
    const captureFullPage = vi.fn(() => Promise.resolve(shot('cdpFullPage')));
    const captureViewport = vi.fn(() => Promise.resolve(shot('visibleTab')));
    const result = await captureScreenshotWithStrategy({
      preferFullPage: () => Promise.resolve(true),
      captureFullPage,
      captureViewport,
    });
    expect(result.captureMethod).toBe('cdpFullPage');
    expect(captureViewport).not.toHaveBeenCalled();
  });

  it('uses the viewport capture when full-page is not preferred (and never tries CDP)', async () => {
    const captureFullPage = vi.fn(() => Promise.resolve(shot('cdpFullPage')));
    const result = await captureScreenshotWithStrategy({
      preferFullPage: () => Promise.resolve(false),
      captureFullPage,
      captureViewport: () => Promise.resolve(shot('visibleTab')),
    });
    expect(result.captureMethod).toBe('visibleTab');
    expect(captureFullPage).not.toHaveBeenCalled();
  });

  it('falls back to the viewport capture when the CDP full-page path throws', async () => {
    const captureViewport = vi.fn(() => Promise.resolve(shot('visibleTab')));
    const result = await captureScreenshotWithStrategy({
      preferFullPage: () => Promise.resolve(true),
      captureFullPage: () => Promise.reject(new Error('Cannot attach to this target')),
      captureViewport,
    });
    expect(result.captureMethod).toBe('visibleTab');
    expect(captureViewport).toHaveBeenCalledTimes(1);
  });
});
