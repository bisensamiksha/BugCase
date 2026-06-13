import { toggleOverlay } from './overlay-root';

// Content entry injected by the service worker (see overlay-controller.ts → OVERLAY_CONTENT_SCRIPT).
// Re-injecting toggles: it mounts the overlay if absent, removes it if already present.
toggleOverlay(document);
