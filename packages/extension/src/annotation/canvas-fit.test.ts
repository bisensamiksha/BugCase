import { describe, expect, it } from 'vitest';

import { computeFitScale, toImageSpace } from './canvas-fit';

describe('computeFitScale', () => {
  it('returns 1 when the screenshot already fits the available area', () => {
    expect(computeFitScale(800, 600, 1000, 800)).toBe(1);
  });

  it('never upscales a screenshot smaller than the available area', () => {
    expect(computeFitScale(400, 300, 1000, 800)).toBe(1);
  });

  it('scales down to the height when a full-page screenshot is too tall', () => {
    // height binds: 300/3000 = 0.1 (width would allow 1000/800 = 1.25)
    expect(computeFitScale(800, 3000, 1000, 300)).toBeCloseTo(0.1, 10);
  });

  it('scales down to the width when a screenshot is too wide', () => {
    expect(computeFitScale(4000, 600, 1000, 800)).toBeCloseTo(0.25, 10);
  });

  it('falls back to 1 (scrollable, not zero-size) when the area is unknown', () => {
    expect(computeFitScale(800, 600, 0, 0)).toBe(1);
  });

  it('falls back to 1 for a degenerate (zero-dimension) screenshot', () => {
    expect(computeFitScale(0, 0, 1000, 800)).toBe(1);
  });
});

describe('toImageSpace', () => {
  it('is the identity transform at scale 1', () => {
    expect(toImageSpace({ x: 40, y: 30 }, 1)).toEqual({ x: 40, y: 30 });
  });

  it('maps a scaled-down pointer back to image-space coordinates', () => {
    // stage drawn at 0.5×: a pointer 40px from the left is really 80px into the image.
    expect(toImageSpace({ x: 40, y: 30 }, 0.5)).toEqual({ x: 80, y: 60 });
  });

  it('passes null through (no pointer over the stage)', () => {
    expect(toImageSpace(null, 0.5)).toBeNull();
  });

  it('treats a non-positive scale as 1 to avoid dividing by zero', () => {
    expect(toImageSpace({ x: 40, y: 30 }, 0)).toEqual({ x: 40, y: 30 });
  });
});
