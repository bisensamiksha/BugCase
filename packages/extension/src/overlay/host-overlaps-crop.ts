/**
 * Does the overlay host actually sit inside the region about to be cropped? (BUG-04)
 *
 * Element crops hide the whole overlay host so BugCase's own UI can't be baked into the image
 * (BUG-03 fix A). Hiding unconditionally makes the picker pill vanish and reappear on *every* click,
 * which reads as a glitch. The pill is small and usually nowhere near the element being inspected,
 * so the hide is only necessary when the two rectangles genuinely intersect.
 *
 * Pure geometry, so it is unit-tested without a layout engine.
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * True when the two rectangles share at least one pixel. Edge-touching is not an overlap — a pill
 * flush against the crop's border contributes nothing to the captured image.
 */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) {
    return false;
  }
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
