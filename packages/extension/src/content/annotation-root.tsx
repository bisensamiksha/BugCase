import { createRoot, type Root } from 'react-dom/client';

import { KonvaAnnotationCanvas } from '../annotation/AnnotationCanvas';

import {
  readAnnotationRequest,
  reportAnnotationOutcome,
  type AnnotationOutcome,
} from './annotation-channel';

/** Id of the host element that holds the on-demand annotation surface's Shadow DOM. */
export const ANNOTATION_HOST_ID = 'bugcase-annotation-root';

// One annotation surface per page; the module tracks the live React root so removal unmounts it cleanly.
let active: { host: HTMLElement; root: Root } | null = null;

export function isAnnotationMounted(doc: Document = document): boolean {
  return doc.getElementById(ANNOTATION_HOST_ID) !== null;
}

export function removeAnnotation(doc: Document = document): boolean {
  const host = active?.host ?? doc.getElementById(ANNOTATION_HOST_ID);
  if (!host) {
    active = null;
    return false;
  }
  active?.root.unmount();
  host.remove();
  active = null;
  return true;
}

/**
 * Mount the on-demand annotation surface (TD-03). Reads the request the overlay stashed on `window`,
 * renders the Konva canvas in its own Shadow DOM host above the overlay, and on Done/Cancel reports the
 * outcome back over the shared channel and tears itself down. Idempotent: a no-op if already mounted or
 * if there is no pending request (so a repeated inject can't double-mount).
 */
export function mountAnnotation(doc: Document = document): boolean {
  if (isAnnotationMounted(doc)) {
    return false;
  }
  const win = doc.defaultView ?? window;
  const request = readAnnotationRequest(win);
  if (!request) {
    return false;
  }

  const host = doc.createElement('div');
  host.id = ANNOTATION_HOST_ID;
  // Reset inherited page styles, then cover the viewport above the overlay. The UI lives in the shadow root.
  host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647;';
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const mountPoint = doc.createElement('div');
  shadowRoot.appendChild(mountPoint);
  (doc.body ?? doc.documentElement).appendChild(host);

  const finish = (outcome: AnnotationOutcome): void => {
    reportAnnotationOutcome(outcome, win);
    removeAnnotation(doc);
  };

  const root = createRoot(mountPoint);
  root.render(
    <KonvaAnnotationCanvas
      reportId={request.reportId}
      screenshot={request.screenshot}
      {...(request.initialShapes ? { initialShapes: request.initialShapes } : {})}
      onComplete={(result) => finish({ status: 'done', result })}
      onCancel={() => finish({ status: 'cancel' })}
    />,
  );
  active = { host, root };
  return true;
}
