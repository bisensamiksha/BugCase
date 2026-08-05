import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export interface VirtualWindow {
  /** First rendered row (inclusive). */
  readonly startIndex: number;
  /** Last rendered row (inclusive); -1 when count === 0. */
  readonly endIndex: number;
  /** Spacer height above the rendered rows (px). */
  readonly padTop: number;
  /** Spacer height below the rendered rows (px). */
  readonly padBottom: number;
}

/**
 * Fixed-height row windowing. Total scroll height is `count * rowH`; only the visible slice
 * (plus `overscan` rows above/below) is rendered, with top/bottom spacers filling the rest.
 * Pure — no DOM — so the math is unit-testable in a plain node environment.
 */
export function computeWindow({
  scrollTop,
  viewportH,
  rowH,
  count,
  overscan = 4,
}: {
  scrollTop: number;
  viewportH: number;
  rowH: number;
  count: number;
  overscan?: number;
}): VirtualWindow {
  if (count <= 0 || rowH <= 0) {
    return { startIndex: 0, endIndex: -1, padTop: 0, padBottom: 0 };
  }
  const first = Math.floor(scrollTop / rowH);
  const visibleCount = Math.ceil(viewportH / rowH);
  const startIndex = Math.max(0, first - overscan);
  const endIndex = Math.min(count - 1, first + visibleCount + overscan);
  const padTop = startIndex * rowH;
  const padBottom = (count - 1 - endIndex) * rowH;
  return { startIndex, endIndex, padTop, padBottom };
}

const raf: (cb: () => void) => void =
  typeof requestAnimationFrame === 'function'
    ? (cb) => requestAnimationFrame(() => cb())
    : (cb) => setTimeout(cb, 0);

/**
 * Hook wrapping {@link computeWindow}: owns the scroll container ref and a rAF-throttled
 * scrollTop/viewportH, recomputing the window each render. Attach `containerRef` + `onScroll`
 * to a fixed-height `overflow-auto` element.
 */
export function useVirtualWindow(
  count: number,
  rowH: number,
  overscan = 4,
): {
  readonly window: VirtualWindow;
  readonly viewportH: number;
  readonly containerRef: RefObject<HTMLDivElement>;
  readonly onScroll: () => void;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const ticking = useRef(false);

  // Mount-only measurement is not enough: both panes render this container with Tailwind's `hidden`
  // (`display: none`) whenever `count === 0`, and a real browser reports `clientHeight === 0` for a
  // `display: none` element. If a pane MOUNTS already filtered to zero rows — reachable via S4-26's
  // hash-shared filters, e.g. opening a shared link whose filter matches nothing — that 0 gets
  // captured here and nothing else ever recomputes it: the only other paths are a native `scroll`
  // event or `onScrollSync`, and neither fires just because rows reappear. Re-running this whenever
  // `count` changes re-measures exactly when a pane transitions into or out of that hidden empty
  // state, so loosening the filter afterward sees the container's real (now-visible) height instead
  // of the stale 0 (S4-27 review, residual 2).
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (el) {
      setViewportH(el.clientHeight);
    }
  }, [count]);

  const onScroll = useCallback(() => {
    if (ticking.current) {
      return;
    }
    ticking.current = true;
    raf(() => {
      const el = containerRef.current;
      if (el) {
        setScrollTop(el.scrollTop);
        setViewportH(el.clientHeight);
      }
      ticking.current = false;
    });
  }, []);

  const window = computeWindow({ scrollTop, viewportH, rowH, count, overscan });
  return { window, viewportH, containerRef, onScroll };
}
