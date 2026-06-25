import { describe, expect, it } from 'vitest';

import type { ScreenInfoSource } from './screen-info';
import { ZOOM_MAX, ZOOM_MIN, collectScreenInfo, estimateZoom } from './screen-info';

const base: ScreenInfoSource = {
  innerWidth: 1280,
  innerHeight: 800,
  outerWidth: 1280,
  outerHeight: 900,
  devicePixelRatio: 2,
  screenWidth: 1920,
  screenHeight: 1080,
  orientation: 'landscape-primary',
};

describe('estimateZoom', () => {
  it('returns the rounded outerWidth/innerWidth ratio', () => {
    expect(estimateZoom({ ...base, innerWidth: 1000, outerWidth: 1200 })).toBeCloseTo(1.2);
    expect(estimateZoom({ ...base, innerWidth: 750, outerWidth: 800 })).toBeCloseTo(1.07);
    expect(estimateZoom({ ...base, innerWidth: 500, outerWidth: 1200 })).toBeCloseTo(2.4);
  });

  it('clamps to the sane range', () => {
    expect(estimateZoom({ ...base, innerWidth: 100, outerWidth: 2000 })).toBe(ZOOM_MAX);
    expect(estimateZoom({ ...base, innerWidth: 2000, outerWidth: 100 })).toBe(ZOOM_MIN);
  });

  it('falls back to 1 when a width is missing', () => {
    expect(estimateZoom({ ...base, innerWidth: 0, outerWidth: 1200 })).toBe(1);
    expect(estimateZoom({ ...base, innerWidth: 1000, outerWidth: 0 })).toBe(1);
  });
});

describe('collectScreenInfo', () => {
  it('maps screen, dpr, window, and orientation fields', () => {
    expect(collectScreenInfo(base)).toEqual({
      innerWidth: 1280,
      innerHeight: 800,
      outerWidth: 1280,
      outerHeight: 900,
      devicePixelRatio: 2,
      zoomEstimate: 1,
      screenWidth: 1920,
      screenHeight: 1080,
      orientation: 'landscape-primary',
    });
  });

  it('floors fractional dimensions and coerces negatives/NaN to 0', () => {
    const info = collectScreenInfo({
      ...base,
      innerWidth: 1000.9,
      screenWidth: -5,
      screenHeight: Number.NaN,
    });
    expect(info.innerWidth).toBe(1000);
    expect(info.screenWidth).toBe(0);
    expect(info.screenHeight).toBe(0);
  });

  it('defaults a non-positive devicePixelRatio to 1', () => {
    expect(collectScreenInfo({ ...base, devicePixelRatio: 0 }).devicePixelRatio).toBe(1);
  });

  it('passes a null orientation through', () => {
    expect(collectScreenInfo({ ...base, orientation: null }).orientation).toBeNull();
  });
});
