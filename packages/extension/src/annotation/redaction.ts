/**
 * Destructive redaction compositor (S3-11).
 *
 * Redaction must be *irreversible*: once a region is blacked out, the underlying pixels cannot be
 * recovered from any exported artifact. The `redact` tool draws a black box for live preview, but Konva
 * rasterises that box with antialiasing, so the region's edge pixels can retain a faint blend of the
 * original. This module overwrites every pixel inside each redaction rect with **fully-opaque, hard-edged
 * black directly on the raw `ImageData` bytes** — the original bytes are overwritten, not copied — so the
 * exported PNG can never carry recoverable information. The pure core is also the test's proof primitive.
 */

import type { Annotation } from './tools';

/** An axis-aligned redaction region, in the pixel space of the image it will be painted onto. */
export interface RedactionRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The subset of the DOM `ImageData` shape the destructive fill reads and writes. */
export interface MutableImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/** The subset of `CanvasRenderingContext2D` used to read pixels back and write the redacted pixels. */
export interface RedactableContext {
  getImageData(x: number, y: number, width: number, height: number): MutableImageData;
  putImageData(image: MutableImageData, x: number, y: number): void;
}

/** The subset of `HTMLCanvasElement` the runtime compositor mutates. */
export interface RedactableCanvas {
  readonly width: number;
  readonly height: number;
  getContext(contextId: '2d'): RedactableContext | null;
}

/** Pull the redaction rectangles out of the annotation model (image-space coordinates). */
export function extractRedactions(shapes: readonly Annotation[]): RedactionRect[] {
  return shapes
    .filter((shape): shape is Extract<Annotation, { type: 'redact' }> => shape.type === 'redact')
    .map(({ x, y, width, height }) => ({ x, y, width, height }));
}

/** Scale image-space rects into a target image's pixel space (e.g. `× devicePixelRatio`). */
export function scaleRedactions(rects: readonly RedactionRect[], scale: number): RedactionRect[] {
  return rects.map((r) => ({
    x: r.x * scale,
    y: r.y * scale,
    width: r.width * scale,
    height: r.height * scale,
  }));
}

/**
 * Overwrite every pixel inside each rect with opaque black `(0, 0, 0, 255)`, in place. Bounds are
 * rounded OUTWARD to whole pixels and clamped to the image, so no antialiased edge pixel of the original
 * survives. Mutating `image.data` directly is the destructive guarantee: the source bytes are gone, not
 * copied elsewhere.
 */
export function paintRectsBlack(image: MutableImageData, rects: readonly RedactionRect[]): void {
  const { data, width, height } = image;
  for (const rect of rects) {
    const left = Math.max(0, Math.floor(rect.x));
    const top = Math.max(0, Math.floor(rect.y));
    const right = Math.min(width, Math.ceil(rect.x + rect.width));
    const bottom = Math.min(height, Math.ceil(rect.y + rect.height));
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const i = (y * width + x) * 4;
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 255;
      }
    }
  }
}

/**
 * Return the first pixel inside `rect` that is not fully-opaque black, or `null` if the whole region is
 * redacted. The proof primitive: a `null` result means no recoverable pixel remains in the region.
 */
export function findNonBlackPixel(
  image: MutableImageData,
  rect: RedactionRect,
): { x: number; y: number } | null {
  const { data, width, height } = image;
  const left = Math.max(0, Math.floor(rect.x));
  const top = Math.max(0, Math.floor(rect.y));
  const right = Math.min(width, Math.ceil(rect.x + rect.width));
  const bottom = Math.min(height, Math.ceil(rect.y + rect.height));
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const i = (y * width + x) * 4;
      if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0 || data[i + 3] !== 255) {
        return { x, y };
      }
    }
  }
  return null;
}

/**
 * Runtime compositor: destructively redact a canvas that already holds the flattened annotated
 * screenshot. Reads the pixels back, blacks out each rect via {@link paintRectsBlack}, and writes them
 * back, mutating the canvas in place. No-op when there are no rects or the 2d context is unavailable.
 */
export function redactCanvas(canvas: RedactableCanvas, rects: readonly RedactionRect[]): void {
  if (rects.length === 0) {
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  paintRectsBlack(image, rects);
  ctx.putImageData(image, 0, 0);
}
