import type { AnnotationResult } from '../annotation/annotation-result';
import {
  INJECT_ANNOTATION,
  type InjectAnnotationRequest,
  type OverlayInjectResponse,
} from '../background/messages';
import { openAnnotation, type AnnotationRequest } from '../content/annotation-channel';
import browser from '../lib/browser';

/** Ask the service worker to inject the on-demand annotation surface into this tab (TD-03). */
function sendInject(): Promise<OverlayInjectResponse> {
  return browser.runtime.sendMessage<InjectAnnotationRequest, OverlayInjectResponse>({
    type: INJECT_ANNOTATION,
  });
}

/**
 * Open the on-demand annotation surface (TD-03) and resolve with the annotation result — or null if the
 * user cancels. Rejects if the surface fails to inject (e.g. a restricted page). This is the default the
 * preview screen uses; it is injectable there so tests and the visual harness need no service worker.
 */
export function requestAnnotation(request: AnnotationRequest): Promise<AnnotationResult | null> {
  return openAnnotation(request, { inject: sendInject });
}
