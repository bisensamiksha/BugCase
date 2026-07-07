/**
 * Crop an element's region out of a viewport screenshot (S3-13).
 *
 * At each pick the service worker captures the visible tab and crops the element's bounding box so the
 * report can show *what* was inspected. The rect arrives in CSS pixels (viewport coords); the
 * screenshot is device pixels, so the region is scaled by the device pixel ratio and clamped to the
 * image. The geometry is a pure, tested function; the canvas work is a thin best-effort wrapper (like
 * the scroll-stitch runner) — a failure just yields no crop, never a broken pick.
 */

import { blobToDataUrl } from '../lib/blob-data-url';

export interface CropRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CropRegion {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
}

/** Scale a CSS-pixel rect to device pixels and clamp it to the image; always ≥ 1×1. */
export function computeCropRegion(
  rect: CropRect,
  scale: number,
  imageWidth: number,
  imageHeight: number,
): CropRegion {
  const w = Math.max(0, imageWidth);
  const h = Math.max(0, imageHeight);
  const clampX = (v: number): number => Math.min(Math.max(0, Math.round(v)), w);
  const clampY = (v: number): number => Math.min(Math.max(0, Math.round(v)), h);
  const left = Math.min(clampX(rect.x * scale), Math.max(0, w - 1));
  const top = Math.min(clampY(rect.y * scale), Math.max(0, h - 1));
  const right = clampX((rect.x + rect.width) * scale);
  const bottom = clampY((rect.y + rect.height) * scale);
  return { sx: left, sy: top, sw: Math.max(1, right - left), sh: Math.max(1, bottom - top) };
}

/** Decode `dataUrl`, crop the element region, and return a PNG data URL — or `null` on any failure. */
export async function cropScreenshot(
  dataUrl: string,
  rect: CropRect,
  scale: number,
): Promise<string | null> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    const region = computeCropRegion(rect, scale, bitmap.width, bitmap.height);
    const canvas = new OffscreenCanvas(region.sw, region.sh);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.drawImage(bitmap, region.sx, region.sy, region.sw, region.sh, 0, 0, region.sw, region.sh);
    bitmap.close();
    const out = await canvas.convertToBlob({ type: 'image/png' });
    return await blobToDataUrl(out);
  } catch {
    return null;
  }
}

export interface CropElementPayload {
  readonly rect: CropRect;
  readonly devicePixelRatio?: number;
}

export interface CropElementResponse {
  readonly ok: boolean;
  /** The cropped element screenshot as a PNG data URL, when the crop succeeded. */
  readonly dataUrl?: string;
}

export interface HandleCropElementDeps {
  /** Capture the visible viewport as a PNG data URL + its device pixel ratio. */
  readonly captureViewport: () => Promise<{ dataUrl: string; devicePixelRatio: number }>;
  /** Crop the region out of a screenshot; defaults to {@link cropScreenshot}. Injectable for tests. */
  readonly crop?: (dataUrl: string, rect: CropRect, scale: number) => Promise<string | null>;
}

/** Capture the viewport and crop the element's rect. Best-effort — resolves `{ ok: false }` on failure. */
export async function handleCropElement(
  payload: CropElementPayload,
  deps: HandleCropElementDeps,
): Promise<CropElementResponse> {
  try {
    const shot = await deps.captureViewport();
    const scale = payload.devicePixelRatio ?? shot.devicePixelRatio ?? 1;
    const crop = deps.crop ?? cropScreenshot;
    const dataUrl = await crop(shot.dataUrl, payload.rect, scale);
    return dataUrl ? { ok: true, dataUrl } : { ok: false };
  } catch {
    return { ok: false };
  }
}
