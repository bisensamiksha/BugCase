import { useCallback, useMemo, useState } from 'react';

export const MIN_SCALE = 1;
export const MAX_SCALE = 8;
export const ZOOM_STEP = 1.25;

export interface ZoomPan {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  /** True at fit (scale === MIN_SCALE): zoom-out and pan are no-ops. */
  readonly isMin: boolean;
  /** CSS transform string for the image element. */
  readonly transform: string;
  zoomIn(): void;
  zoomOut(): void;
  reset(): void;
  zoomBy(factor: number): void;
  panBy(dx: number, dy: number): void;
}

const clampScale = (scale: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/**
 * Zoom + pan state for the lightbox. Pure of any layout measurement (no element sizes), so it is
 * deterministic under jsdom: `scale` is clamped to `[MIN_SCALE, MAX_SCALE]`, the offset re-zeros
 * whenever zoom returns to fit, and panning is a no-op while at fit.
 */
export function useZoomPan(): ZoomPan {
  const [scale, setScale] = useState(MIN_SCALE);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const applyScale = useCallback((next: number) => {
    const clamped = clampScale(next);
    setScale(clamped);
    if (clamped === MIN_SCALE) {
      setOffset({ x: 0, y: 0 });
    }
  }, []);

  const zoomIn = useCallback(() => applyScale(scale * ZOOM_STEP), [applyScale, scale]);
  const zoomOut = useCallback(() => applyScale(scale / ZOOM_STEP), [applyScale, scale]);
  const zoomBy = useCallback((factor: number) => applyScale(scale * factor), [applyScale, scale]);
  const reset = useCallback(() => {
    setScale(MIN_SCALE);
    setOffset({ x: 0, y: 0 });
  }, []);
  const panBy = useCallback(
    (dx: number, dy: number) => {
      if (scale <= MIN_SCALE) {
        return;
      }
      setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    },
    [scale],
  );

  const transform = useMemo(
    () => `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
    [offset.x, offset.y, scale],
  );

  return {
    scale,
    offsetX: offset.x,
    offsetY: offset.y,
    isMin: scale <= MIN_SCALE,
    transform,
    zoomIn,
    zoomOut,
    reset,
    zoomBy,
    panBy,
  };
}
