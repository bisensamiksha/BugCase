import type { ConsoleLog, NetworkLog, ScreenshotRef, ScreenshotsManifest } from '@bugcase/schema';

/**
 * Pure, null-safe view-model derivations for the Overview pane (S4-03). No React/DOM — so they are
 * node-testable and reusable by the self-contained `report.html` template later. Every function
 * tolerates a `null`/`undefined` (or partial) report section and returns safe defaults.
 */

export interface ConsoleCounts {
  readonly total: number;
  readonly errors: number;
  readonly warnings: number;
}

export interface NetworkCounts {
  readonly total: number;
  readonly failed: number;
}

export type ScreenshotKind = 'viewport' | 'fullPage' | 'elementCrop';

export interface ScreenshotSummaryItem {
  readonly kind: ScreenshotKind;
  readonly width: number;
  readonly height: number;
  readonly captureMethod: string;
  readonly hasAnnotations: boolean;
}

export interface ScreenshotSummary {
  /** The primary shot to feature: fullPage, else viewport, else the first element crop. */
  readonly hero: ScreenshotSummaryItem | null;
  readonly items: readonly ScreenshotSummaryItem[];
  readonly elementCropCount: number;
}

export function consoleCounts(log: ConsoleLog | null | undefined): ConsoleCounts {
  const entries = log?.entries ?? [];
  let errors = 0;
  let warnings = 0;
  for (const entry of entries) {
    if (entry.level === 'error') {
      errors += 1;
    } else if (entry.level === 'warn') {
      warnings += 1;
    }
  }
  return { total: entries.length, errors, warnings };
}

export function networkCounts(log: NetworkLog | null | undefined): NetworkCounts {
  const entries = log?.entries ?? [];
  let failed = 0;
  for (const entry of entries) {
    if (entry.failed || (entry.status != null && entry.status >= 400)) {
      failed += 1;
    }
  }
  return { total: entries.length, failed };
}

function toItem(kind: ScreenshotKind, ref: ScreenshotRef): ScreenshotSummaryItem {
  return {
    kind,
    width: ref.width,
    height: ref.height,
    captureMethod: ref.captureMethod,
    hasAnnotations: ref.hasAnnotations,
  };
}

export function screenshotSummary(
  manifest: ScreenshotsManifest | null | undefined,
): ScreenshotSummary {
  const items: ScreenshotSummaryItem[] = [];
  if (manifest?.fullPage) {
    items.push(toItem('fullPage', manifest.fullPage));
  }
  if (manifest?.viewport) {
    items.push(toItem('viewport', manifest.viewport));
  }
  const crops = manifest?.elementCrops ?? [];
  for (const crop of crops) {
    items.push(toItem('elementCrop', crop));
  }
  return { hero: items[0] ?? null, items, elementCropCount: crops.length };
}
