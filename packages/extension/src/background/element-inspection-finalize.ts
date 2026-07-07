/**
 * Assemble the picked element inspections into the report (S3-13).
 *
 * The overlay sends raw inspections (structural facts + a crop data URL) in CAPTURE_REPORT; this
 * assigns each a stable id + a ZIP path for its crop, rehydrates the crop data URL into a Blob for the
 * archive, and builds the `elementCrops` screenshot refs. Pure (the id + blob makers are injectable),
 * so the ZIP wiring is unit-tested without a real image codec.
 */

import type {
  ElementAncestor,
  ElementInspection,
  ElementInspectionsManifest,
  ScreenshotRef,
} from '@bugcase/schema';

/** What the overlay sends per picked element in CAPTURE_REPORT (crop is a data URL, or null). */
export interface CaptureElementInspection {
  readonly outerHtml: string;
  readonly computedStyles: Record<string, string>;
  readonly boundingClientRect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly ancestors: readonly ElementAncestor[];
  readonly cropDataUrl: string | null;
}

export interface BuiltElementInspections {
  readonly manifest: ElementInspectionsManifest;
  /** Crop files to add to the ZIP assets, keyed by their `screenshotCropPath`. */
  readonly cropFiles: Map<string, Blob>;
  /** Refs for `report.screenshots.elementCrops`. */
  readonly elementCrops: ScreenshotRef[];
}

export interface BuildElementInspectionsDeps {
  /** Id generator (injectable for tests); defaults to `crypto.randomUUID`. */
  readonly newId?: () => string;
  /** Rehydrate a crop data URL into a Blob; defaults to a base64 decode. Injectable for tests. */
  readonly toBlob?: (dataUrl: string) => Blob | null;
}

function defaultNewId(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return cryptoApi?.randomUUID ? cryptoApi.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function defaultDataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match || match[2] === undefined) {
    return null;
  }
  try {
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: match[1] ?? 'image/png' });
  } catch {
    return null;
  }
}

function cropPathFor(index: number): string {
  return `screenshots/crops/element-${index + 1}.png`;
}

export function buildElementInspections(
  raw: readonly CaptureElementInspection[],
  deps: BuildElementInspectionsDeps = {},
): BuiltElementInspections | null {
  if (raw.length === 0) {
    return null;
  }
  const newId = deps.newId ?? defaultNewId;
  const toBlob = deps.toBlob ?? defaultDataUrlToBlob;

  const inspections: ElementInspection[] = [];
  const cropFiles = new Map<string, Blob>();
  const elementCrops: ScreenshotRef[] = [];

  raw.forEach((item, index) => {
    let screenshotCropPath = '';
    const blob = item.cropDataUrl ? toBlob(item.cropDataUrl) : null;
    if (blob) {
      screenshotCropPath = cropPathFor(index);
      cropFiles.set(screenshotCropPath, blob);
      elementCrops.push({
        path: screenshotCropPath,
        width: Math.max(0, Math.round(item.boundingClientRect.width)),
        height: Math.max(0, Math.round(item.boundingClientRect.height)),
        devicePixelRatio: 1,
        captureMethod: 'visibleTab',
        hasAnnotations: false,
      });
    }
    inspections.push({
      id: newId(),
      outerHtml: item.outerHtml,
      computedStyles: item.computedStyles,
      boundingClientRect: item.boundingClientRect,
      ancestors: item.ancestors,
      screenshotCropPath,
    });
  });

  return { manifest: { schemaVersion: 'v1', inspections }, cropFiles, elementCrops };
}
