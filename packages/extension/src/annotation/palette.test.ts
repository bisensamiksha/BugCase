import { describe, expect, it } from 'vitest';

import { PRESET_COLORS, STROKE_WIDTHS } from './palette';
import { DEFAULT_COLOR, DEFAULT_STROKE_WIDTH } from './tools';

describe('PRESET_COLORS', () => {
  it('offers exactly 8 colors', () => {
    expect(PRESET_COLORS).toHaveLength(8);
  });

  it('has no duplicates', () => {
    expect(new Set(PRESET_COLORS).size).toBe(PRESET_COLORS.length);
  });

  it('are all valid #rrggbb hex colors', () => {
    for (const color of PRESET_COLORS) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('includes the canvas default color so the initial selection is highlighted', () => {
    expect(PRESET_COLORS).toContain(DEFAULT_COLOR);
  });
});

describe('STROKE_WIDTHS', () => {
  it('offers exactly 3 widths', () => {
    expect(STROKE_WIDTHS).toHaveLength(3);
  });

  it('are strictly ascending', () => {
    for (let i = 1; i < STROKE_WIDTHS.length; i++) {
      expect(STROKE_WIDTHS[i]!).toBeGreaterThan(STROKE_WIDTHS[i - 1]!);
    }
  });

  it('includes the canvas default width', () => {
    expect(STROKE_WIDTHS).toContain(DEFAULT_STROKE_WIDTH);
  });
});
