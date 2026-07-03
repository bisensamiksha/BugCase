/**
 * Flatten the annotated Konva stage (screenshot + annotation layers) to a single PNG data URL for export.
 *
 * Runs in the overlay, where the real Konva stage lives; the service worker cannot rasterize. Typed against
 * a minimal {@link FlattenableStage} so tests need no real canvas.
 */

export interface FlattenableStage {
  toDataURL(config?: { pixelRatio?: number }): string;
}

/**
 * Rasterize `stage` to a PNG `data:` URL. `pixelRatio` should match the source screenshot's device pixel
 * ratio so the flattened image keeps the original dimensions; defaults to 1.
 */
export function flattenAnnotatedScreenshot(stage: FlattenableStage, pixelRatio = 1): string {
  return stage.toDataURL({ pixelRatio });
}
