import { describe, expect, it, vi } from 'vitest';

import {
  captureFullPageByScrollStitch,
  planScrollStitch,
  type PageMetrics,
  type ScrollStitchEffects,
  type ScrollStitchPlan,
} from './scroll-stitch';

const metrics = (over: Partial<PageMetrics> = {}): PageMetrics => ({
  pageWidth: 1280,
  pageHeight: 2000,
  viewportWidth: 1280,
  viewportHeight: 800,
  devicePixelRatio: 1,
  ...over,
});

describe('planScrollStitch', () => {
  it('produces a single tile when the page fits in the viewport', () => {
    const plan = planScrollStitch(metrics({ pageHeight: 600, viewportHeight: 800 }));
    expect(plan.tiles).toEqual([{ scrollY: 0, dy: 0 }]);
    expect(plan.canvasHeight).toBe(600);
    expect(plan.canvasWidth).toBe(1280);
  });

  it('tiles an exact multiple of the viewport with no overlap', () => {
    const plan = planScrollStitch(metrics({ pageHeight: 2400, viewportHeight: 800 }));
    expect(plan.tiles.map((t) => t.scrollY)).toEqual([0, 800, 1600]);
    expect(plan.canvasHeight).toBe(2400);
  });

  it('clamps the last tile to the bottom for a non-multiple page height', () => {
    const plan = planScrollStitch(metrics({ pageHeight: 2000, viewportHeight: 800 }));
    // ceil(2000/800)=3 tiles; last clamps to maxScroll = 2000-800 = 1200
    expect(plan.tiles.map((t) => t.scrollY)).toEqual([0, 800, 1200]);
    expect(plan.canvasHeight).toBe(2000);
  });

  it('scales canvas size and destination offsets by devicePixelRatio', () => {
    const plan = planScrollStitch(
      metrics({ pageHeight: 1600, viewportHeight: 800, pageWidth: 1280, devicePixelRatio: 2 }),
    );
    expect(plan.canvasWidth).toBe(2560);
    expect(plan.canvasHeight).toBe(3200);
    expect(plan.tiles.map((t) => t.dy)).toEqual([0, 1600]);
    expect(plan.devicePixelRatio).toBe(2);
  });
});

describe('captureFullPageByScrollStitch', () => {
  function fakeEffects(over: Partial<ScrollStitchEffects<string>> = {}) {
    const scrolled: number[] = [];
    let captureCount = 0;
    const order: string[] = [];
    const effects: ScrollStitchEffects<string> = {
      getMetrics: () => Promise.resolve(metrics()),
      freeze: () => {
        order.push('freeze');
        return Promise.resolve();
      },
      restore: () => {
        order.push('restore');
        return Promise.resolve();
      },
      scrollTo: (y) => {
        scrolled.push(y);
        return Promise.resolve();
      },
      captureTile: () => {
        const tile = `tile${captureCount}`;
        captureCount += 1;
        order.push('capture');
        return Promise.resolve(tile);
      },
      stitch: () => Promise.resolve(new Blob([new Uint8Array([1])], { type: 'image/png' })),
      ...over,
    };
    return { effects, scrolled, order };
  }

  it('freezes, scrolls + captures each tile in order, stitches, then restores', async () => {
    const stitch = vi.fn((_plan: ScrollStitchPlan, _tiles: readonly string[]) =>
      Promise.resolve(new Blob([new Uint8Array([1])], { type: 'image/png' })),
    );
    const { effects, scrolled, order } = fakeEffects({ stitch });

    const result = await captureFullPageByScrollStitch(effects);

    expect(scrolled).toEqual([0, 800, 1200]);
    expect(order).toEqual(['freeze', 'capture', 'capture', 'capture', 'restore']);
    const [plan, tiles] = stitch.mock.calls[0] ?? [];
    expect(plan?.tiles.map((t) => t.scrollY)).toEqual([0, 800, 1200]);
    expect(tiles).toEqual(['tile0', 'tile1', 'tile2']);
    expect(result.width).toBe(1280);
    expect(result.height).toBe(2000);
    expect(result.captureMethod).toBe('scrollStitch');
    expect(result.blob).toBeInstanceOf(Blob);
  });

  it('always restores the page even when a tile capture fails, and rethrows', async () => {
    const { effects, order } = fakeEffects({
      captureTile: () => Promise.reject(new Error('captureVisibleTab quota')),
    });
    await expect(captureFullPageByScrollStitch(effects)).rejects.toThrow(/quota/);
    expect(order).toContain('freeze');
    expect(order).toContain('restore');
  });
});
