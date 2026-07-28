import { OVERLAY_HOST_ID } from '../shared/overlay-host';

import { rectsOverlap, type Rect } from './host-overlaps-crop';

/** Resolve after the browser has painted the next frame (double rAF), so a visibility change is
 *  on screen before we proceed. Falls back to a resolved promise when rAF is unavailable. */
function nextPaint(): Promise<void> {
  if (typeof requestAnimationFrame !== 'function') return Promise.resolve();
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/**
 * Hide the overlay's Shadow-DOM host for the duration of `fn` (a screenshot / crop), then restore its
 * previous visibility — so BugCase's own UI never lands in the captured image. Waits a double rAF so
 * the panel is repainted away before the service worker screenshots. No-ops (just runs `fn`) when the
 * host isn't mounted, keeping unit tests and the visual harness unaffected.
 */
export interface WithHostHiddenOptions {
  /**
   * The region about to be captured. When the host does not intersect it, hiding is pointless — the
   * host cannot appear in the image — so it is skipped and the UI stays put. Omit for a full-viewport
   * capture, where the host is always in frame.
   */
  readonly skipIfClearOf?: Rect;
}

export async function withHostHidden<T>(
  fn: () => Promise<T>,
  doc: Document = document,
  options: WithHostHiddenOptions = {},
): Promise<T> {
  const host = doc.getElementById(OVERLAY_HOST_ID);
  if (!host) return fn();
  // An element crop that misses the overlay entirely needs no hide — this is what stopped the
  // picker pill blinking on every click (BUG-04).
  if (options.skipIfClearOf && !rectsOverlap(host.getBoundingClientRect(), options.skipIfClearOf)) {
    return fn();
  }
  const previous = host.style.visibility;
  host.style.visibility = 'hidden';
  await nextPaint();
  try {
    return await fn();
  } finally {
    host.style.visibility = previous;
  }
}
