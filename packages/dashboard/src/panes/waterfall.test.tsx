// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Waterfall, barGeometry, statusClassColor } from './Waterfall';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('barGeometry', () => {
  it('places a full-range bar from the start', () => {
    expect(barGeometry(0, 500, 1000)).toEqual({ xPct: 0, widthPct: 50 });
  });

  it('offsets a bar by its start time', () => {
    expect(barGeometry(250, 500, 1000)).toEqual({ xPct: 25, widthPct: 50 });
  });

  it('returns an empty geometry when the total range is zero', () => {
    expect(barGeometry(0, 0, 0)).toEqual({ xPct: 0, widthPct: 0 });
  });

  it('renders a zero-width marker for a null (failed/no-timing) duration', () => {
    expect(barGeometry(100, null, 1000)).toEqual({ xPct: 10, widthPct: 0 });
  });

  it('clamps width so the bar never overflows the track', () => {
    expect(barGeometry(900, 500, 1000)).toEqual({ xPct: 90, widthPct: 10 });
  });

  it('keeps a tiny-but-real duration visible with a minimum width', () => {
    const { widthPct } = barGeometry(0, 1, 100000);
    expect(widthPct).toBeGreaterThanOrEqual(0.5);
  });
});

describe('statusClassColor', () => {
  it('maps known classes and falls back for unknown', () => {
    expect(statusClassColor('2xx')).not.toBe(statusClassColor('5xx'));
    expect(statusClassColor('nope')).toBe(statusClassColor('1xx'));
  });
});

describe('Waterfall', () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders a labeled svg with a timing bar', () => {
    act(() => {
      root.render(
        <Waterfall startOffsetMs={100} durationMs={200} totalMs={1000} cls="2xx" label="200 ms" />,
      );
    });
    const svg = container.querySelector('svg[role="img"]');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-label')).toBe('200 ms');
    // A drawn bar rect exists (in addition to the faint track rect).
    expect(container.querySelectorAll('rect').length).toBeGreaterThanOrEqual(2);
  });
});
