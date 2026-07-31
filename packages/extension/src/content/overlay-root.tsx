import { createRoot, type Root } from 'react-dom/client';

import { OverlayApp } from '../overlay/OverlayApp';
import { OVERLAY_HOST_ID } from '../shared/overlay-host';

import { requestClearTabCaptureData } from './clear-tab-capture-data-request';
import { queryOverlayOpen, reportOverlayState } from './overlay-state-report';

/** Id of the host element that holds the overlay's Shadow DOM. Kept stable so removal can find it. */
export { OVERLAY_HOST_ID };

/**
 * Window flag the content entry checks to mount (not toggle) the overlay. Set by the service worker
 * before re-injecting the overlay to continue a recording across a navigation (S3-12), so a repeated
 * inject can't accidentally remove the freshly-mounted pill.
 */
export const OVERLAY_MOUNT_ONLY_FLAG = '__bugcaseOverlayMountOnly';

// One overlay per page; the module tracks the live React root so removal can unmount it cleanly.
let active: { host: HTMLElement; root: Root } | null = null;

/**
 * Window flag marking that this document already has the bfcache reconcile listener (BUG-05).
 * The content entry is re-executed on every inject, so a module-level guard would reset and stack up
 * duplicate listeners; the flag lives on the window, which survives re-injection.
 */
const PAGESHOW_HOOK_FLAG = '__bugcaseOverlayPageshowHook';

/**
 * Reconcile this document against the worker's authoritative overlay-open flag (BUG-05).
 *
 * The back/forward cache restores a document verbatim — including an overlay host mounted before the
 * user navigated away. Closing the overlay on a *later* page cannot reach that cached document, so on
 * restore it would come back as a zombie the user had already dismissed. `null` means the worker
 * could not be reached; leave the page untouched rather than guess.
 */
async function reconcileWithWorker(doc: Document): Promise<void> {
  const shouldBeOpen = await queryOverlayOpen();
  if (shouldBeOpen === null) {
    return;
  }
  if (shouldBeOpen && !isOverlayMounted(doc)) {
    mountOverlay(doc);
  } else if (!shouldBeOpen && isOverlayMounted(doc)) {
    removeOverlay(doc);
  }
}

function ensurePageshowReconcile(doc: Document): void {
  const view = doc.defaultView as (Window & Record<string, unknown>) | null;
  if (!view || view[PAGESHOW_HOOK_FLAG] === true) {
    return;
  }
  view[PAGESHOW_HOOK_FLAG] = true;
  view.addEventListener('pageshow', (event) => {
    // `persisted` is true only for a back/forward cache restore, not an ordinary load.
    if (event.persisted) {
      void reconcileWithWorker(doc);
    }
  });
}

export function isOverlayMounted(doc: Document = document): boolean {
  return doc.getElementById(OVERLAY_HOST_ID) !== null;
}

export function mountOverlay(doc: Document = document): boolean {
  if (isOverlayMounted(doc)) {
    return false;
  }

  const host = doc.createElement('div');
  host.id = OVERLAY_HOST_ID;
  // Reset inherited page styles, then float above page content. The UI itself lives in the shadow root.
  host.style.cssText = 'all: initial; position: fixed; inset: 0 auto auto 0; z-index: 2147483647;';

  const shadowRoot = host.attachShadow({ mode: 'open' });
  const mountPoint = doc.createElement('div');
  shadowRoot.appendChild(mountPoint);
  (doc.body ?? doc.documentElement).appendChild(host);

  const root = createRoot(mountPoint);
  root.render(<OverlayApp onClose={() => removeOverlay(doc)} />);
  active = { host, root };
  // BUG-05: tell the worker the overlay is open so it re-mounts it across navigations.
  reportOverlayState(true);
  // BUG-05: this document may later be restored from the back/forward cache with the overlay still
  // in its DOM; reconcile against the worker on restore so a dismissed overlay does not come back.
  ensurePageshowReconcile(doc);
  return true;
}

export function removeOverlay(doc: Document = document): boolean {
  const host = active?.host ?? doc.getElementById(OVERLAY_HOST_ID);
  if (!host) {
    active = null;
    return false;
  }
  active?.root.unmount();
  host.remove();
  active = null;
  // BUG-05: an explicit close must stop the worker re-mounting the overlay on the next navigation.
  reportOverlayState(false);
  // BUG-06 follow-up: the same "explicit close" signal must wipe every captured-data store for this
  // tab — the draft, the reproduction recording, and the passive error badge — so a closed overlay is
  // always a fresh canvas on reopen. This function is the one place every close path ends up: the ×
  // buttons (via `OverlayApp`'s `onClose`), the toolbar icon (via `toggleOverlay`), and the post-download
  // close (via the preview's `onComplete` → `onClose`) all unmount React by calling this directly, so
  // `OverlayApp`'s own draft clear on its × buttons is the only one of those that ever runs — without
  // this call the recording in particular would survive the other two closes and restore as a completed
  // session on reopen (shown as a stale "Track again"). See clear-tab-capture-data.ts for what gets wiped
  // and why (and, just as importantly, what is deliberately left alone).
  // `reconcileWithWorker` also lands here, but only when the worker already says the overlay is closed,
  // so the tab's data is already gone by then and the extra wipe is a no-op.
  requestClearTabCaptureData();
  return true;
}

export function toggleOverlay(doc: Document = document): boolean {
  if (isOverlayMounted(doc)) {
    removeOverlay(doc);
    return false;
  }
  return mountOverlay(doc);
}
