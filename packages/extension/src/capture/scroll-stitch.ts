/**
 * Full-page screenshot fallback by scroll-and-stitch (S2-12).
 *
 * When the CDP full-page path (S2-11) isn't available, the page is captured a viewport at a time:
 * freeze the page (hide sticky/fixed, stop animations), scroll through it capturing each tile via
 * `tabs.captureVisibleTab`, stitch the tiles onto one canvas, then restore the page. The geometry
 * ({@link planScrollStitch}) is pure and the browser effects are injected, so the logic is testable
 * without a browser; the service worker supplies the real effects.
 */

export interface PageMetrics {
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly devicePixelRatio: number;
}

/** One captured tile: where to scroll the page, and where to draw it on the stitched canvas. */
export interface ScrollStitchTile {
  /** CSS-pixel scroll offset for this tile. */
  readonly scrollY: number;
  /** Device-pixel y offset on the canvas to draw this tile at. */
  readonly dy: number;
}

export interface ScrollStitchPlan {
  readonly tiles: readonly ScrollStitchTile[];
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly devicePixelRatio: number;
}

/**
 * Compute the scroll offsets and canvas geometry for a scroll-stitch capture. Tiles step down by
 * one viewport; the last tile is clamped to the page bottom (browsers clamp scrolling anyway), so it
 * overlaps the previous tile with identical content — safe to draw over.
 */
export function planScrollStitch(metrics: PageMetrics): ScrollStitchPlan {
  const dpr = metrics.devicePixelRatio > 0 ? metrics.devicePixelRatio : 1;
  const viewportHeight = Math.max(1, metrics.viewportHeight);
  const maxScroll = Math.max(0, metrics.pageHeight - viewportHeight);
  const count = Math.max(1, Math.ceil(metrics.pageHeight / viewportHeight));

  const tiles: ScrollStitchTile[] = [];
  for (let i = 0; i < count; i += 1) {
    const scrollY = Math.min(i * viewportHeight, maxScroll);
    // Defensive: skip a tile identical to the previous one (can't happen with the formula above,
    // but keeps malformed metrics from producing duplicate captures).
    if (tiles.length > 0 && tiles[tiles.length - 1]?.scrollY === scrollY) {
      continue;
    }
    tiles.push({ scrollY, dy: Math.round(scrollY * dpr) });
  }

  return {
    tiles,
    canvasWidth: Math.round(metrics.pageWidth * dpr),
    canvasHeight: Math.round(metrics.pageHeight * dpr),
    devicePixelRatio: dpr,
  };
}

/** Injected browser effects so the orchestration is unit-testable without a real page. */
export interface ScrollStitchEffects<Tile> {
  readonly getMetrics: () => Promise<PageMetrics>;
  /** Hide sticky/fixed, freeze animations, and save scroll position. */
  readonly freeze: () => Promise<void>;
  /** Reverse {@link freeze} and restore scroll position. */
  readonly restore: () => Promise<void>;
  readonly scrollTo: (scrollY: number) => Promise<void>;
  /** Capture the current viewport as a tile (e.g. an `ImageBitmap`). */
  readonly captureTile: () => Promise<Tile>;
  /** Draw the tiles onto one canvas and encode it. */
  readonly stitch: (plan: ScrollStitchPlan, tiles: readonly Tile[]) => Promise<Blob>;
}

export interface ScrollStitchResult {
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
  readonly captureMethod: 'scrollStitch';
}

/**
 * Capture the full page by scrolling and stitching. Always restores the page in a `finally`, even if
 * a tile capture or the stitch fails (the error propagates to the caller, which falls back to a
 * plain viewport capture).
 */
export async function captureFullPageByScrollStitch<Tile>(
  effects: ScrollStitchEffects<Tile>,
): Promise<ScrollStitchResult> {
  const plan = planScrollStitch(await effects.getMetrics());

  await effects.freeze();
  try {
    const tiles: Tile[] = [];
    for (const tile of plan.tiles) {
      await effects.scrollTo(tile.scrollY);
      tiles.push(await effects.captureTile());
    }
    const blob = await effects.stitch(plan, tiles);
    return {
      blob,
      width: plan.canvasWidth,
      height: plan.canvasHeight,
      captureMethod: 'scrollStitch',
    };
  } finally {
    await effects.restore();
  }
}
