import { createRoot, type Root } from 'react-dom/client';

import { OverlayApp } from '../overlay/OverlayApp';
import { OVERLAY_HOST_ID } from '../shared/overlay-host';

import { reportOverlayState } from './overlay-state-report';

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
  return true;
}

export function toggleOverlay(doc: Document = document): boolean {
  if (isOverlayMounted(doc)) {
    removeOverlay(doc);
    return false;
  }
  return mountOverlay(doc);
}
