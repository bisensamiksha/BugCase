/**
 * Element-crop size budget for the durable overlay draft (BUG-06).
 *
 * Crops are base64 PNG data URLs and are the only unbounded part of the draft; everything else is
 * small text. `chrome.storage.session` has a ~10 MB quota shared with the step-tracking session
 * (text-only, capped at 500 steps), so crops are budgeted at 8 MB.
 *
 * Nothing is ever evicted. A crop's size is only knowable after it exists — PNG size depends on
 * image content, not the element's box — so the budget is applied to each incoming pick: it keeps
 * its structural data and loses only its image, and the picker says so. Silent loss is the bug this
 * ticket exists to fix, so the constraint is made visible at the moment of the action.
 */

import type { CaptureElementInspection } from '../background/element-inspection-finalize';

/** Bytes of crop image data retained across all inspections in the draft. */
export const CROP_BUDGET_BYTES = 8 * 1024 * 1024;

const BASE64_PREFIX = /^data:[^;,]*;base64,/;

/** Approximate decoded byte size of a base64 data URL; 0 when it isn't one. */
export function dataUrlBytes(dataUrl: string): number {
  if (!BASE64_PREFIX.test(dataUrl)) {
    return 0;
  }
  const base64 = dataUrl.replace(BASE64_PREFIX, '');
  if (base64.length === 0) {
    return 0;
  }
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

/** Total crop bytes currently held across `inspections`. */
export function usedCropBytes(inspections: readonly CaptureElementInspection[]): number {
  return inspections.reduce(
    (total, inspection) =>
      total + (inspection.cropDataUrl === null ? 0 : dataUrlBytes(inspection.cropDataUrl)),
    0,
  );
}

export interface CropFitResult {
  /** The inspection to store — identical to the incoming one, or the same minus its image. */
  readonly inspection: CaptureElementInspection;
  /** True when the image was dropped because it did not fit. */
  readonly dropped: boolean;
  /** Decoded size of the incoming crop, in bytes. */
  readonly cropBytes: number;
  /** Bytes that were free before this pick. */
  readonly remainingBytes: number;
  /** The budget applied, in bytes. */
  readonly budgetBytes: number;
}

/**
 * Decide whether an incoming inspection's crop fits the remaining budget.
 *
 * Never touches `existing` — already-stored images are kept, so a late large pick cannot retroactively
 * strip earlier evidence.
 */
export function fitInspectionToBudget(
  existing: readonly CaptureElementInspection[],
  incoming: CaptureElementInspection,
  budgetBytes: number = CROP_BUDGET_BYTES,
): CropFitResult {
  const remainingBytes = Math.max(0, budgetBytes - usedCropBytes(existing));
  const cropBytes = incoming.cropDataUrl === null ? 0 : dataUrlBytes(incoming.cropDataUrl);
  if (incoming.cropDataUrl === null || cropBytes <= remainingBytes) {
    return { inspection: incoming, dropped: false, cropBytes, remainingBytes, budgetBytes };
  }
  return {
    inspection: { ...incoming, cropDataUrl: null },
    dropped: true,
    cropBytes,
    remainingBytes,
    budgetBytes,
  };
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** User-facing explanation of a dropped crop, shown in the picker (spec §4.5). */
export function formatBudgetNotice(fit: CropFitResult): string {
  return (
    `Added without its image: the crop was ${formatMb(fit.cropBytes)} and only ` +
    `${formatMb(fit.remainingBytes)} is left of the ${formatMb(fit.budgetBytes)} limit. ` +
    `Structure and CSS were saved.`
  );
}
