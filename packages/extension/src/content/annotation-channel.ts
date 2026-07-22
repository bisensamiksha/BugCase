import type { ScreenshotRef } from '@bugcase/schema';

import type { AnnotationResult } from '../annotation/annotation-result';
import type { Annotation } from '../annotation/tools';

/** What the overlay hands to the annotation surface: which held screenshot to annotate. */
export interface AnnotationRequest {
  readonly reportId: string;
  readonly screenshot: ScreenshotRef;
  /**
   * Marks to preload into the canvas (BUG-02) — set on Re-annotate so the previous redactions/shapes
   * reappear and the user can edit or delete individual ones. `Annotation` is imported type-only, so the
   * overlay stays Konva-free.
   */
  readonly initialShapes?: readonly Annotation[];
}

/** What the annotation surface reports back: a completed annotation, or a cancel. */
export type AnnotationOutcome =
  | { readonly status: 'done'; readonly result: AnnotationResult }
  | { readonly status: 'cancel' };

/**
 * The overlay and the annotation surface are injected by the same extension into the SAME isolated
 * world of the same top frame, so they share one `window`. The request rides a window key and the
 * result rides a DOM CustomEvent — the same shared-isolated-world mechanism as `__bugcaseOverlayMountOnly`
 * (see overlay-root.tsx). This keeps Konva out of the always-injected overlay while letting the two
 * surfaces coordinate in-page, with no service-worker relay for the result (TD-03).
 */
const REQUEST_KEY = '__bugcaseAnnotationRequest';
const RESULT_EVENT = 'bugcase:annotation-result';

interface InjectResult {
  readonly ok: boolean;
  readonly reason?: string;
}

/** Overlay side: stash the request, inject the surface, resolve with the canvas result (or null on cancel). */
export function openAnnotation(
  request: AnnotationRequest,
  deps: { inject: () => Promise<InjectResult>; target?: Window },
): Promise<AnnotationResult | null> {
  const win = deps.target ?? window;
  (win as unknown as Record<string, unknown>)[REQUEST_KEY] = request;
  return new Promise<AnnotationResult | null>((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => {
      win.removeEventListener(RESULT_EVENT, onResult);
      delete (win as unknown as Record<string, unknown>)[REQUEST_KEY];
    };
    const onResult = (event: Event): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      const outcome = (event as CustomEvent<AnnotationOutcome>).detail;
      resolve(outcome.status === 'done' ? outcome.result : null);
    };
    win.addEventListener(RESULT_EVENT, onResult);
    deps
      .inject()
      .then((res) => {
        if (!res.ok && !settled) {
          settled = true;
          cleanup();
          reject(new Error(res.reason ?? 'annotation surface failed to inject'));
        }
      })
      .catch((err: unknown) => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
  });
}

/** Annotation side: read the pending request the overlay stashed. */
export function readAnnotationRequest(target: Window = window): AnnotationRequest | null {
  const value = (target as unknown as Record<string, unknown>)[REQUEST_KEY];
  return value !== null && typeof value === 'object' ? (value as AnnotationRequest) : null;
}

/** Annotation side: report the outcome back to the overlay. */
export function reportAnnotationOutcome(outcome: AnnotationOutcome, target: Window = window): void {
  target.dispatchEvent(new CustomEvent<AnnotationOutcome>(RESULT_EVENT, { detail: outcome }));
}
