import { describe, expect, it } from 'vitest';

import { MIN_VISIBLE, clampPanelPosition } from './draggable-panel';

const panel = { width: 320, height: 400 };
const viewport = { innerWidth: 1000, innerHeight: 800 };

describe('clampPanelPosition', () => {
  it('leaves an in-bounds position unchanged', () => {
    expect(clampPanelPosition({ top: 50, left: 100 }, panel, viewport)).toEqual({
      top: 50,
      left: 100,
    });
  });

  it('keeps at least a grabbable strip on-screen when dragged far right/down', () => {
    const clamped = clampPanelPosition({ top: 5000, left: 5000 }, panel, viewport);
    expect(clamped.left).toBe(viewport.innerWidth - MIN_VISIBLE);
    expect(clamped.top).toBe(viewport.innerHeight - MIN_VISIBLE);
  });

  it('keeps a grabbable strip on-screen when dragged far left/up', () => {
    const clamped = clampPanelPosition({ top: -500, left: -5000 }, panel, viewport);
    // Left can go negative (panel mostly off the left edge) but MIN_VISIBLE stays visible.
    expect(clamped.left).toBe(MIN_VISIBLE - panel.width);
    expect(clamped.top).toBe(0);
  });
});
