import { OVERLAY_HOST_ID } from '../shared/overlay-host';

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
export async function withHostHidden<T>(
  fn: () => Promise<T>,
  doc: Document = document,
): Promise<T> {
  const host = doc.getElementById(OVERLAY_HOST_ID);
  if (!host) return fn();
  const previous = host.style.visibility;
  host.style.visibility = 'hidden';
  await nextPaint();
  try {
    return await fn();
  } finally {
    host.style.visibility = previous;
  }
}
