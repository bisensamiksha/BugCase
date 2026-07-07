import { describe, expect, it, vi } from 'vitest';

import { computeCropRegion, handleCropElement } from './element-crop';

describe('computeCropRegion', () => {
  it('scales a CSS-pixel rect to device pixels', () => {
    const region = computeCropRegion({ x: 10, y: 20, width: 100, height: 50 }, 2, 2000, 1000);
    expect(region).toEqual({ sx: 20, sy: 40, sw: 200, sh: 100 });
  });

  it('clamps a rect that spills past the image bounds', () => {
    const region = computeCropRegion({ x: -30, y: 0, width: 100, height: 2000 }, 1, 200, 300);
    // Negative origin clamps to 0 and the width/height are capped to what remains on the image.
    expect(region).toEqual({ sx: 0, sy: 0, sw: 70, sh: 300 });
  });

  it('never produces a zero/negative-sized region', () => {
    const region = computeCropRegion({ x: 500, y: 500, width: 0, height: 0 }, 1, 400, 400);
    expect(region.sw).toBeGreaterThanOrEqual(1);
    expect(region.sh).toBeGreaterThanOrEqual(1);
    expect(region.sx).toBeLessThanOrEqual(399);
    expect(region.sy).toBeLessThanOrEqual(399);
  });
});

describe('handleCropElement', () => {
  it('captures the viewport, crops the rect, and returns the crop data URL', async () => {
    const captureViewport = vi.fn(() =>
      Promise.resolve({ dataUrl: 'data:image/png;base64,AAA', devicePixelRatio: 2 }),
    );
    const crop = vi.fn(() => Promise.resolve('data:image/png;base64,CROP'));
    const rect = { x: 1, y: 2, width: 3, height: 4 };

    const res = await handleCropElement({ rect }, { captureViewport, crop });

    expect(res).toEqual({ ok: true, dataUrl: 'data:image/png;base64,CROP' });
    expect(crop).toHaveBeenCalledWith('data:image/png;base64,AAA', rect, 2);
  });

  it('returns ok:false when the crop fails', async () => {
    const res = await handleCropElement(
      { rect: { x: 0, y: 0, width: 1, height: 1 } },
      {
        captureViewport: () => Promise.resolve({ dataUrl: 'x', devicePixelRatio: 1 }),
        crop: () => Promise.resolve(null),
      },
    );
    expect(res.ok).toBe(false);
  });

  it('returns ok:false when the capture throws', async () => {
    const res = await handleCropElement(
      { rect: { x: 0, y: 0, width: 1, height: 1 } },
      { captureViewport: () => Promise.reject(new Error('denied')) },
    );
    expect(res.ok).toBe(false);
  });
});
