/**
 * Element-inspection size budget for the durable overlay draft (BUG-06).
 *
 * Inspections are the only unbounded part of the draft: a crop is a base64 PNG data URL, and
 * `outerHtml` can serialize megabytes when the user picks a container on a modern SPA.
 * `chrome.storage.session` has a ~10 MB quota shared with the step-tracking session (text-only,
 * capped at 500 steps), so inspections are budgeted at 8 MB.
 *
 * Nothing is ever evicted. A crop's size is only knowable after it exists — PNG size depends on
 * image content, not the element's box — so the budget is applied to each incoming pick: it keeps
 * its structural data and loses only its image, and the picker says so. Silent loss is the bug this
 * ticket exists to fix, so the constraint is made visible at the moment of the action.
 */

import type { CaptureElementInspection } from '../background/element-inspection-finalize';

/** Bytes of inspection data retained across all inspections in the draft. */
export const CROP_BUDGET_BYTES = 8 * 1024 * 1024;

/**
 * Bytes a data URL costs once stored.
 *
 * `chrome.storage.session` charges the *serialized* value, not the decoded image, and a base64 data
 * URL is ASCII — one character costs one stored byte. Measuring the decoded PNG size instead would
 * under-count by ~4/3: 8 MB decoded is ~11.2 million stored characters, over the whole quota on its
 * own. A draft the budget then called "in limits" would be rejected by `storage.set`, the rejection
 * is swallowed by `saveOverlayDraft`, and the draft would silently freeze at its last good write —
 * BUG-06 recurring invisibly at the very ceiling meant to prevent it.
 */
export function dataUrlStoredBytes(dataUrl: string): number {
  return dataUrl.length;
}

/**
 * Bytes the given inspections cost in the draft: each one's crop image plus its `outerHtml`.
 *
 * `outerHtml` is counted because it is not "small text" — picking a container on a modern SPA can
 * serialize 0.5–3 MB, so a few such picks would exhaust the quota with almost no crop bytes and the
 * budget would never fire. It reduces the space left for images; only an *image* is ever dropped,
 * never the structural data, which is what makes an inspection actionable.
 *
 * The remaining fields are bounded per inspection — a curated computed-style set, a bounding box and
 * at most five ancestors — so they are left out of the measure rather than tracked field by field.
 */
export function usedDraftBytes(inspections: readonly CaptureElementInspection[]): number {
  return inspections.reduce(
    (total, inspection) =>
      total +
      inspection.outerHtml.length +
      (inspection.cropDataUrl === null ? 0 : dataUrlStoredBytes(inspection.cropDataUrl)),
    0,
  );
}

export interface CropFitResult {
  /** The inspection to store — identical to the incoming one, or the same minus its image. */
  readonly inspection: CaptureElementInspection;
  /** True when the image was dropped because it did not fit. */
  readonly dropped: boolean;
  /** Stored size of the incoming crop, in bytes. */
  readonly cropBytes: number;
  /** Bytes left for this pick's image once its structural data is charged. */
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
  // The incoming pick's structural data is stored either way — only its image can be dropped — so it
  // is charged first and `remainingBytes` is the space genuinely left for the image. That also keeps
  // the user-facing notice honest when it is a big `outerHtml`, not earlier crops, that used the budget.
  const remainingBytes = Math.max(
    0,
    budgetBytes - usedDraftBytes(existing) - incoming.outerHtml.length,
  );
  const cropBytes = incoming.cropDataUrl === null ? 0 : dataUrlStoredBytes(incoming.cropDataUrl);
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
