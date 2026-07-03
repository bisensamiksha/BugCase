/**
 * Flatten the annotated Konva stage (screenshot + annotation layers) to a single PNG data URL for export.
 *
 * Runs in the overlay, where the real Konva stage lives; the service worker cannot rasterize. Typed against
 * a minimal {@link FlattenableStage} so tests need no real canvas.
 */

import { redactCanvas, type RedactableCanvas, type RedactionRect } from './redaction';

export interface FlattenableStage {
  toDataURL(config?: { pixelRatio?: number }): string;
}

/** A Konva stage's `toCanvas`, returning a canvas we can both redact and export. */
export interface CanvasFlattenableStage {
  toCanvas(config?: { pixelRatio?: number }): RedactableCanvas & {
    toDataURL(type?: string): string;
  };
}

/**
 * Rasterize `stage` to a PNG `data:` URL. `pixelRatio` should match the source screenshot's device pixel
 * ratio so the flattened image keeps the original dimensions; defaults to 1.
 */
export function flattenAnnotatedScreenshot(stage: FlattenableStage, pixelRatio = 1): string {
  return stage.toDataURL({ pixelRatio });
}

/**
 * Flatten `stage` to a canvas, **destructively** bake the redaction rects into it (see
 * {@link redactCanvas}), then export the redacted canvas as a PNG data URL. Used instead of
 * {@link flattenAnnotatedScreenshot} whenever the annotation contains redactions, so the exported image
 * can never carry recoverable pixels under a black box. `rects` are in the exported canvas's pixel space.
 */
export function flattenRedactedScreenshot(
  stage: CanvasFlattenableStage,
  pixelRatio: number,
  rects: readonly RedactionRect[],
): string {
  const canvas = stage.toCanvas({ pixelRatio });
  redactCanvas(canvas, rects);
  return canvas.toDataURL('image/png');
}
