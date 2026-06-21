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

const deps = (over: Partial<Parameters<typeof captureScreenshotWithStrategy>[0]> = {}) => ({
  preferFullPage: () => Promise.resolve(false),
  captureFullPage: vi.fn(() => Promise.resolve(shot('cdpFullPage'))),
  captureScrollStitch: vi.fn(() => Promise.resolve(shot('scrollStitch'))),
  captureViewport: vi.fn(() => Promise.resolve(shot('visibleTab'))),
  ...over,
});

describe('captureScreenshotWithStrategy', () => {
  it('uses CDP full-page when preferred (and nothing else)', async () => {
    const d = deps({ preferFullPage: () => Promise.resolve(true) });
    const result = await captureScreenshotWithStrategy(d);
    expect(result.captureMethod).toBe('cdpFullPage');
    expect(d.captureScrollStitch).not.toHaveBeenCalled();
    expect(d.captureViewport).not.toHaveBeenCalled();
  });

  it('uses scroll-stitch when CDP is not preferred (and never tries CDP)', async () => {
    const d = deps({ preferFullPage: () => Promise.resolve(false) });
    const result = await captureScreenshotWithStrategy(d);
    expect(result.captureMethod).toBe('scrollStitch');
    expect(d.captureFullPage).not.toHaveBeenCalled();
    expect(d.captureViewport).not.toHaveBeenCalled();
  });

  it('falls back to scroll-stitch when the CDP full-page path throws', async () => {
    const d = deps({
      preferFullPage: () => Promise.resolve(true),
      captureFullPage: vi.fn(() => Promise.reject(new Error('attach failed'))),
    });
    const result = await captureScreenshotWithStrategy(d);
    expect(result.captureMethod).toBe('scrollStitch');
  });

  it('falls back to the viewport when both full-page paths fail', async () => {
    const d = deps({
      preferFullPage: () => Promise.resolve(true),
      captureFullPage: vi.fn(() => Promise.reject(new Error('attach failed'))),
      captureScrollStitch: vi.fn(() => Promise.reject(new Error('quota'))),
    });
    const result = await captureScreenshotWithStrategy(d);
    expect(result.captureMethod).toBe('visibleTab');
    expect(d.captureViewport).toHaveBeenCalledTimes(1);
  });
});
