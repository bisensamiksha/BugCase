import { describe, expect, it } from 'vitest';

import { computeWindow } from './virtual-window';

describe('computeWindow', () => {
  it('returns an empty window for a zero count', () => {
    expect(computeWindow({ scrollTop: 0, viewportH: 100, rowH: 20, count: 0 })).toEqual({
      startIndex: 0,
      endIndex: -1,
      padTop: 0,
      padBottom: 0,
    });
  });

  it('renders all rows when the count is small (no overscan clamp needed)', () => {
    const w = computeWindow({ scrollTop: 0, viewportH: 100, rowH: 20, count: 3, overscan: 4 });
    expect(w.startIndex).toBe(0);
    expect(w.endIndex).toBe(2);
    expect(w.padTop).toBe(0);
    expect(w.padBottom).toBe(0);
  });

  it('windows to the visible slice plus overscan when scrolled into the middle', () => {
    const w = computeWindow({ scrollTop: 200, viewportH: 100, rowH: 20, count: 100, overscan: 2 });
    // first visible = 200/20 = 10; visibleCount = ceil(100/20) = 5
    expect(w.startIndex).toBe(8); // 10 - 2
    expect(w.endIndex).toBe(17); // 10 + 5 + 2
  });

  it('clamps the start at 0 and the end at count-1', () => {
    const top = computeWindow({ scrollTop: 0, viewportH: 100, rowH: 20, count: 100, overscan: 4 });
    expect(top.startIndex).toBe(0);
    const bottom = computeWindow({
      scrollTop: 20 * 99,
      viewportH: 100,
      rowH: 20,
      count: 100,
      overscan: 4,
    });
    expect(bottom.endIndex).toBe(99);
    expect(bottom.padBottom).toBe(0);
  });

  it('keeps padTop + rendered height + padBottom equal to the total height', () => {
    const rowH = 20;
    const count = 100;
    const w = computeWindow({ scrollTop: 500, viewportH: 100, rowH, count, overscan: 3 });
    const rendered = (w.endIndex - w.startIndex + 1) * rowH;
    expect(w.padTop + rendered + w.padBottom).toBe(count * rowH);
  });
});
