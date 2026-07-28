import { describe, expect, it } from 'vitest';

import { rectsOverlap, type Rect } from './host-overlaps-crop';

const crop: Rect = { x: 100, y: 100, width: 200, height: 100 };

describe('rectsOverlap (BUG-04 — stop the picker pill flickering)', () => {
  it('is false when the pill sits clear of the cropped element', () => {
    expect(rectsOverlap({ x: 400, y: 400, width: 180, height: 60 }, crop)).toBe(false);
  });

  it('is true when the pill sits over the cropped element', () => {
    expect(rectsOverlap({ x: 150, y: 120, width: 180, height: 60 }, crop)).toBe(true);
  });

  it('is true for partial overlap on a single corner', () => {
    expect(rectsOverlap({ x: 280, y: 180, width: 100, height: 100 }, crop)).toBe(true);
  });

  it('is false for rectangles that merely touch edges (no shared pixels)', () => {
    expect(rectsOverlap({ x: 300, y: 100, width: 50, height: 50 }, crop)).toBe(false);
    expect(rectsOverlap({ x: 100, y: 200, width: 50, height: 50 }, crop)).toBe(false);
  });

  it('is false for a zero-area pill', () => {
    expect(rectsOverlap({ x: 150, y: 120, width: 0, height: 0 }, crop)).toBe(false);
  });

  it('is true when the crop is entirely inside the pill', () => {
    expect(rectsOverlap({ x: 0, y: 0, width: 1000, height: 1000 }, crop)).toBe(true);
  });

  it('handles negative coordinates (element scrolled above the viewport)', () => {
    expect(
      rectsOverlap({ x: -50, y: -50, width: 100, height: 100 }, { ...crop, x: -60, y: -60 }),
    ).toBe(true);
  });
});
