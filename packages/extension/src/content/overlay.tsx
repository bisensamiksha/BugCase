import { OVERLAY_MOUNT_ONLY_FLAG, mountOverlay, toggleOverlay } from './overlay-root';

// Content entry injected by the service worker (see overlay-controller.ts → OVERLAY_CONTENT_SCRIPT).
// Normally re-injecting toggles: it mounts the overlay if absent, removes it if already present.
// But when the worker re-injects it to continue a recording across a navigation (S3-12) it sets a
// one-shot window flag so this entry mounts idempotently instead of toggling (a second inject for the
// same load must not remove the freshly-mounted pill).
const flags = window as unknown as Record<string, unknown>;
const mountOnly = flags[OVERLAY_MOUNT_ONLY_FLAG] === true;
delete flags[OVERLAY_MOUNT_ONLY_FLAG];

if (mountOnly) {
  mountOverlay(document);
} else {
  toggleOverlay(document);
}
