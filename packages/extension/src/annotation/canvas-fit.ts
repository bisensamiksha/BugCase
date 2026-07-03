/**
 * Fit-to-window scaling for the annotation canvas.
 *
 * The Konva stage is drawn in the screenshot's own (image-space) pixel coordinates, then scaled down so
 * the *whole* screenshot is visible inside the overlay — the same "contain" behaviour the Lightbox uses.
 * This keeps full-page captures from overflowing the viewport (which previously clipped everything but the
 * bottom section) and shrinks the canvas the compositor has to paint.
 */

/**
 * Largest scale ≤ 1 that fits an `imgW × imgH` screenshot into an `availW × availH` box.
 *
 * Never upscales (caps at 1). A non-positive available dimension is treated as "unknown" and ignored, so
 * the result is always in `(0, 1]` and the stage is never sized to zero (a scrollable full-size fallback).
 */
export function computeFitScale(
  imgW: number,
  imgH: number,
  availW: number,
  availH: number,
): number {
  if (imgW <= 0 || imgH <= 0) {
    return 1;
  }
  const byWidth = availW > 0 ? availW / imgW : 1;
  const byHeight = availH > 0 ? availH / imgH : 1;
  return Math.min(byWidth, byHeight, 1);
}

export interface FitPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Convert an on-screen pointer position (in the scaled stage's pixels) back into the screenshot's own
 * image-space coordinates, so shapes are always stored at full resolution regardless of the fit `scale`.
 * A non-positive `scale` is treated as `1` to avoid dividing by zero during the first render.
 */
export function toImageSpace(point: FitPoint | null, scale: number): FitPoint | null {
  if (!point) {
    return null;
  }
  const s = scale > 0 ? scale : 1;
  return { x: point.x / s, y: point.y / s };
}
