import { describe, expect, it } from 'vitest';

import { contrastRatio, meetsAA, relativeLuminance } from './contrast';

describe('relativeLuminance', () => {
  it('returns 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('applies the sRGB linearisation curve, not a raw average', () => {
    // Mid grey is perceptually ~50% but linearises to ~0.216 (WCAG 2.1 formula).
    expect(relativeLuminance('#808080')).toBeCloseTo(0.2159, 3);
  });

  it('accepts uppercase hex', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(relativeLuminance('#ffffff'), 10);
  });

  it('rejects malformed input rather than returning a silent wrong answer', () => {
    expect(() => relativeLuminance('fff')).toThrow(/hex/i);
    expect(() => relativeLuminance('#ggg000')).toThrow(/hex/i);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2);
  });

  it('is 1 for a colour against itself', () => {
    expect(contrastRatio('#2563eb', '#2563eb')).toBeCloseTo(1, 5);
  });

  it('is order-independent', () => {
    expect(contrastRatio('#2563eb', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#2563eb'),
      10,
    );
  });

  it('matches a known reference value', () => {
    // blue-600 on white — the dashboard's light-theme accent.
    expect(contrastRatio('#2563eb', '#ffffff')).toBeCloseTo(5.17, 2);
  });
});

describe('meetsAA', () => {
  it('requires 4.5:1 for normal text', () => {
    expect(meetsAA(4.5)).toBe(true);
    expect(meetsAA(4.49)).toBe(false);
  });

  it('requires only 3:1 for large text', () => {
    expect(meetsAA(3, { large: true })).toBe(true);
    expect(meetsAA(2.99, { large: true })).toBe(false);
  });
});
