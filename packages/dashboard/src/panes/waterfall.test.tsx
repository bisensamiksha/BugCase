// @vitest-environment jsdom
import { contrastRatio, darkTheme, lightTheme } from '@bugcase/shared-tokens';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Waterfall, barGeometry, statusClassColor, STATUS_CLASS_COLOR } from './Waterfall';

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

describe('STATUS_CLASS_COLOR contrast guard (S4-27 final review)', () => {
  // A dedicated test here, rather than promoting these fills into `shared-tokens`' MATRIX
  // (`contrast.test.ts`): MATRIX guards *semantic* tokens that are meant to flip per theme
  // (`ThemeTokens`), but `STATUS_CLASS_COLOR` is the opposite by design — fixed, theme-invariant
  // literals (see its doc comment in `Waterfall.tsx` for why: a filled chip/bar needs one color that
  // reads the same regardless of theme, not a role that flips per theme). Forcing these into
  // `ThemeTokens` would mean inventing a light AND dark value for something that must NOT change
  // between themes, which distorts the token model to fit a guard mechanism rather than the other
  // way round. A small dedicated check, using the same `contrastRatio` helper MATRIX itself uses,
  // guards the actual invariant (fixed literal, dual floor) without that distortion.
  const WHITE = '#ffffff';

  it('clears 4.5:1 for white text on every chip fill (WCAG 1.4.3, the status filter chips)', () => {
    for (const [cls, fill] of Object.entries(STATUS_CLASS_COLOR)) {
      const ratio = contrastRatio(WHITE, fill);
      expect(ratio, `white on ${cls} (${fill}) = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it('clears 3:1 for every chip fill against both themes’ bg/surface (WCAG 1.4.11, the waterfall bars)', () => {
    for (const [cls, fill] of Object.entries(STATUS_CLASS_COLOR)) {
      for (const [themeName, theme] of [
        ['lightTheme', lightTheme],
        ['darkTheme', darkTheme],
      ] as const) {
        for (const bgRole of ['bg', 'surface'] as const) {
          const bg = theme[bgRole];
          const ratio = contrastRatio(fill, bg);
          expect(
            ratio,
            `${cls} (${fill}) on ${themeName}.${bgRole} (${bg}) = ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    }
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
