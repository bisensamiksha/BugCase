import { mountAnnotation } from './annotation-root';

// On-demand annotation surface injected by the service worker (TD-03) when the user clicks Annotate.
// This is the entry the dedicated `vite.annotation.config.ts` bundles into `content/annotation.js` — the
// only place Konva ships, so `overlay.js` never carries it. Idempotent: a repeated inject while the
// surface is already mounted (or with no pending request) is a no-op.
mountAnnotation(document);
