/**
 * Id of the host element that carries the BugCase overlay's Shadow DOM. Kept in a dependency-free
 * shared module so MAIN-world injected code (e.g. the reproduction recorder, S3-12) can recognize and
 * ignore events originating from our own UI without importing the React overlay bundle.
 */
export const OVERLAY_HOST_ID = 'bugcase-overlay-root';
