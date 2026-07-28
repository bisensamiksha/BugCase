import { embedReportData } from '@bugcase/report-template';
import {
  BUG_REPORT_ZIP_LAYOUT,
  aggregateScrubberHits,
  type AnnotationFile,
  type AnnotationsManifest,
  type BrowserInfo,
  type BugReportV1,
  type BugReportZipAssets,
  type CaptureMetadata,
  type ConsoleLog,
  type InstalledExtensionInfo,
  type NavigationLog,
  type NetworkLog,
  type ReproductionRecording,
  type ScreenshotRef,
  type ScreenshotsManifest,
  type StorageDump,
  type UserInput,
  type WriteBugReportZipOptions,
} from '@bugcase/schema';

import { annotationFilePath } from '../annotation/konva-serialization';
import type { CollectCookiesResult } from '../capture/cookies';
import type { DomSnapshotResult } from '../capture/dom-snapshot';
import type { CapturedScreenshot } from '../capture/screenshot-strategy';
import type { DebuggerNetworkCaptureResult } from '../debugger/run-network-capture';
import type { ArtifactId } from '../preview/artifact-list';

import { buildCaptureReportFilename } from './downloads';
import {
  buildElementInspections,
  type CaptureElementInspection,
} from './element-inspection-finalize';

export interface CaptureFlowInput {
  readonly metadata: CaptureMetadata;
  readonly userInput: UserInput;
  /** Browser info collected in the page context; recorded as `report.browser`. */
  readonly browser?: BrowserInfo;
  /** Console ring-buffer log collected in the overlay (S2-25); recorded as `report.console`. */
  readonly console?: ConsoleLog | null;
  /** Network ring-buffer log collected in the overlay (S2-25); recorded as `report.network`. */
  readonly network?: NetworkLog | null;
  /** Reproduction recording flushed + mapped in the overlay (S3-12); recorded as `report.reproduction`. */
  readonly reproduction?: ReproductionRecording | null;
  /** Elements the user inspected with the picker (S3-13); folded into `report.elementInspections`. */
  readonly elementInspections?: readonly CaptureElementInspection[] | null;
}

/** Capture-side injected effects: assemble the report. Never downloads. */
export interface CaptureReportDeps {
  readonly captureScreenshot: () => Promise<CapturedScreenshot>;
  /**
   * Optional on-demand debugger network capture (S2-10). When provided it is invoked during the
   * flow; it never throws and shows a user banner while attached. Bodies are surfaced on the result
   * for a later ticket (S2-24) to fold into the report's NetworkLog.
   */
  readonly captureDebuggerNetwork?: () => Promise<DebuggerNetworkCaptureResult>;
  /**
   * Optional DOM snapshot collector (S2-13). When provided, the scrubbed outerHTML is written at its
   * contentPath and recorded as `report.dom`. Never throws; a `null` result means "no snapshot".
   */
  readonly collectDom?: () => Promise<DomSnapshotResult | null>;
  /**
   * Optional navigation-history collector (S2-15). When provided, its result is recorded as
   * `report.navigation`. Never throws; `null` means "not collected" (no `history` permission/error).
   */
  readonly collectNavigation?: () => Promise<NavigationLog | null>;
  /**
   * Optional installed-extensions collector (S2-16). When provided, its result is folded into
   * `report.browser.installedExtensions`. Never throws; `null` means "not collected" (no `management`
   * permission/error) and preserves whatever browser info already carried.
   */
  readonly collectExtensions?: () => Promise<readonly InstalledExtensionInfo[] | null>;
  /**
   * Optional cookies collector (S2-17). When provided, it is called with the captured page url and
   * its result is recorded as `report.cookies` (all values masked by default). Never throws; `null`
   * means "not collected" (no `cookies` permission/error).
   */
  readonly collectCookies?: (url: string) => Promise<CollectCookiesResult | null>;
  /**
   * Optional local/session storage collector (S2-18). When provided, its result is recorded as
   * `report.storage` (secret-looking values masked by default). Never throws; `null` means "not
   * collected" (no tab id / restricted page / error).
   */
  readonly collectStorage?: () => Promise<StorageDump | null>;
}

/** Finalize-side injected effects: write the ZIP + download. */
export interface FinalizeReportDeps {
  readonly writeZip: (
    report: BugReportV1,
    assets: BugReportZipAssets,
    options?: WriteBugReportZipOptions,
  ) => Promise<Blob>;
  readonly download: (blob: Blob, filename: string) => Promise<number>;
  /**
   * The report.html template (S4-15). When set, finalize embeds the final report + assets into it
   * and adds `report.html` to the ZIP. Optional so tests that don't exercise it stay unchanged.
   */
  readonly reportTemplateHtml?: string;
  readonly now?: () => Date;
}

/** Combined deps for the one-shot `runCaptureFlow` (capture + finalize, no removals). */
export type CaptureFlowDeps = CaptureReportDeps & FinalizeReportDeps;

/** Result of assembling a report in `captureReport` (held in the worker until finalize). */
export interface CapturedReportResult {
  readonly ok: boolean;
  readonly report?: BugReportV1;
  readonly assets?: BugReportZipAssets;
  /** Byte sizes for binary artifacts the report only references (screenshot, DOM). */
  readonly assetSizes?: Partial<Record<ArtifactId, number>>;
  readonly debuggerNetwork?: DebuggerNetworkCaptureResult;
  readonly reason?: string;
}

export interface CaptureFlowResult {
  readonly ok: boolean;
  readonly downloadId?: number;
  readonly filename?: string;
  readonly byteSize?: number;
  readonly reason?: string;
  readonly debuggerNetwork?: DebuggerNetworkCaptureResult;
}

function toReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const encoder = new TextEncoder();

/**
 * Capture phase: screenshot + optional collectors → assemble a `BugReportV1` and its asset files
 * (with metadata collected upstream in the page context). Runs in the service worker; never
 * downloads. Any failure (denied capture, collector error) resolves to `{ ok: false, reason }`.
 */
export async function captureReport(
  input: CaptureFlowInput,
  deps: CaptureReportDeps,
): Promise<CapturedReportResult> {
  try {
    const shot = await deps.captureScreenshot();

    // Optional on-demand debugger network capture (S2-10). Never throws; a banner is shown while
    // the debugger is attached. Bodies are carried on the result for S2-24 to map into the report.
    const debuggerNetwork = deps.captureDebuggerNetwork
      ? await deps.captureDebuggerNetwork()
      : undefined;

    // Optional DOM snapshot (S2-13): scrubbed outerHTML stored in the ZIP + recorded as report.dom.
    const dom = deps.collectDom ? await deps.collectDom() : null;

    // Optional navigation history (S2-15): recent visits behind the optional `history` permission.
    const navigation = deps.collectNavigation ? await deps.collectNavigation() : null;

    // Optional cookies (S2-17): the captured origin's cookies behind the optional `cookies`
    // permission, scoped to the page url. All values are masked by default inside the collector.
    const cookiesResult = deps.collectCookies
      ? await deps.collectCookies(input.metadata.page.url)
      : null;

    // Optional local/session storage (S2-18): masked, bounded localStorage/sessionStorage read in
    // the page. Never throws; `null` means not collected.
    const storage = deps.collectStorage ? await deps.collectStorage() : null;

    // Optional installed extensions (S2-16): management.getAll behind the optional `management`
    // permission, folded into report.browser. Dropped if no browser info was collected upstream.
    const extensions = deps.collectExtensions ? await deps.collectExtensions() : null;
    const reportBrowser: BrowserInfo | null = input.browser
      ? { ...input.browser, installedExtensions: extensions ?? input.browser.installedExtensions }
      : null;

    // A full-page capture (CDP, or the future scroll-stitch) goes in the `fullPage` slot; a plain
    // viewport capture goes in `viewport`. Either way it's the report's primary screenshot.
    const isFullPage = shot.captureMethod !== 'visibleTab';
    const screenshotPath = isFullPage
      ? BUG_REPORT_ZIP_LAYOUT.screenshots.fullPage
      : BUG_REPORT_ZIP_LAYOUT.screenshots.viewport;
    const screenshotRef: ScreenshotRef = {
      path: screenshotPath,
      width: shot.width,
      height: shot.height,
      devicePixelRatio: shot.devicePixelRatio,
      captureMethod: shot.captureMethod,
      hasAnnotations: false,
    };
    // Element inspections (S3-13): assign ids + crop paths, and surface the crop refs + files.
    const inspections = buildElementInspections(input.elementInspections ?? []);

    const screenshots: ScreenshotsManifest = {
      schemaVersion: 'v1',
      ...(isFullPage ? { fullPage: screenshotRef } : { viewport: screenshotRef }),
      elementCrops: inspections?.elementCrops ?? [],
    };

    // Recorded evidence (S4-13): merge every scrub run's per-rule hits into the one
    // metadata.scrubbersApplied slot — overlay-carried (network) + DOM + cookies + inspections.
    const scrubbersApplied = aggregateScrubberHits([
      ...input.metadata.scrubbersApplied,
      ...(dom?.scrubbersApplied ?? []),
      ...(cookiesResult?.scrubbersApplied ?? []),
      ...(input.elementInspections ?? []).flatMap(
        (inspection) => inspection.scrubbersApplied ?? [],
      ),
    ]);
    const reportMetadata: CaptureMetadata = { ...input.metadata, scrubbersApplied };

    const report: BugReportV1 = {
      schemaVersion: 'v1',
      metadata: reportMetadata,
      userInput: input.userInput,
      screenshots,
      browser: reportBrowser,
      console: input.console ?? null,
      network: input.network ?? null,
      dom: dom?.snapshot ?? null,
      storage,
      cookies: cookiesResult?.cookies ?? null,
      navigation,
      reproduction: input.reproduction ?? null,
      elementInspections: inspections?.manifest ?? null,
      // Populated at finalize by applyAnnotations; not yet annotated at capture time (S3-15).
      annotations: null,
    };

    const files = new Map<string, Blob | string | Uint8Array>([[screenshotPath, shot.blob]]);
    if (dom) {
      files.set(dom.snapshot.contentPath, dom.html);
    }
    if (inspections) {
      for (const [path, blob] of inspections.cropFiles) {
        files.set(path, blob);
      }
    }

    const assetSizes: Partial<Record<ArtifactId, number>> = { screenshot: shot.blob.size };
    if (dom) {
      assetSizes.dom = encoder.encode(dom.html).length;
    }

    return {
      ok: true,
      report,
      assets: { files },
      assetSizes,
      ...(debuggerNetwork ? { debuggerNetwork } : {}),
    };
  } catch (error) {
    return { ok: false, reason: toReason(error) };
  }
}

const EMPTY_SCREENSHOTS: ScreenshotsManifest = { schemaVersion: 'v1', elementCrops: [] };

/**
 * Produce a trimmed report + assets with the chosen artifacts removed. `metadata`, `userInput`,
 * `reproduction`, and `elementInspections` are non-removable and ignored if present in `removedIds`.
 * Pure — the inputs are not mutated.
 */
export function applyArtifactRemovals(
  report: BugReportV1,
  assets: BugReportZipAssets,
  removedIds: readonly ArtifactId[],
): { report: BugReportV1; assets: BugReportZipAssets } {
  if (removedIds.length === 0) {
    return { report, assets };
  }
  const removed = new Set(removedIds);
  const files = new Map(assets.files);
  let next = report;

  if (removed.has('screenshot')) {
    for (const ref of [
      report.screenshots.viewport,
      report.screenshots.fullPage,
      ...report.screenshots.elementCrops,
    ]) {
      if (ref) {
        files.delete(ref.path);
      }
    }
    next = { ...next, screenshots: EMPTY_SCREENSHOTS };
  }
  if (removed.has('dom')) {
    if (report.dom) {
      files.delete(report.dom.contentPath);
    }
    next = { ...next, dom: null };
  }
  if (removed.has('browser')) next = { ...next, browser: null };
  if (removed.has('console')) next = { ...next, console: null };
  if (removed.has('network')) next = { ...next, network: null };
  if (removed.has('storage')) next = { ...next, storage: null };
  if (removed.has('cookies')) next = { ...next, cookies: null };
  if (removed.has('navigation')) next = { ...next, navigation: null };

  return { report: next, assets: { files } };
}

/**
 * Drop individual element inspections and their crop images (BUG-05). Element crops are raw pixels
 * like any screenshot, so the user needs a way to discard one whose image shows something sensitive
 * without losing every inspection. Pure; inputs are not mutated.
 */
export function applyInspectionRemovals(
  report: BugReportV1,
  assets: BugReportZipAssets,
  removedInspectionIds: readonly string[],
): { report: BugReportV1; assets: BugReportZipAssets } {
  if (removedInspectionIds.length === 0 || !report.elementInspections) {
    return { report, assets };
  }
  const removed = new Set(removedInspectionIds);
  const kept = report.elementInspections.inspections.filter((i) => !removed.has(i.id));
  if (kept.length === report.elementInspections.inspections.length) {
    return { report, assets };
  }
  const droppedPaths = new Set(
    report.elementInspections.inspections
      .filter((i) => removed.has(i.id))
      .map((i) => i.screenshotCropPath),
  );
  const files = new Map(assets.files);
  for (const path of droppedPaths) {
    files.delete(path);
  }
  return {
    report: {
      ...report,
      elementInspections:
        kept.length > 0 ? { ...report.elementInspections, inspections: kept } : null,
      screenshots: {
        ...report.screenshots,
        elementCrops: report.screenshots.elementCrops.filter((c) => !droppedPaths.has(c.path)),
      },
    },
    assets: { files },
  };
}

/** A flattened annotated screenshot + its Konva JSON, produced in the overlay and applied at finalize. */
export interface AnnotationExport {
  /** ZIP path of the screenshot the annotations cover (e.g. `screenshots/viewport.png`). */
  readonly screenshotPath: string;
  /** The flattened (screenshot + annotation layers) PNG that replaces the original screenshot. */
  readonly annotatedScreenshot: Blob | Uint8Array;
  /** The saved Konva annotations, written at `annotations/<name>.konva.json`. */
  readonly annotationFile: AnnotationFile;
}

/**
 * Mark the screenshot ref whose path matches as annotated — set `hasAnnotations` and point
 * `annotationsPath` at its saved `.konva.json` so consumers can locate it — preserving the shape.
 */
function flagAnnotated(manifest: ScreenshotsManifest, path: string): ScreenshotsManifest {
  const mark = (ref: ScreenshotRef): ScreenshotRef =>
    ref.path === path
      ? { ...ref, hasAnnotations: true, annotationsPath: annotationFilePath(path) }
      : ref;
  return {
    ...manifest,
    ...(manifest.viewport ? { viewport: mark(manifest.viewport) } : {}),
    ...(manifest.fullPage ? { fullPage: mark(manifest.fullPage) } : {}),
    elementCrops: manifest.elementCrops.map(mark),
  };
}

/**
 * Replace the screenshot blob with its flattened annotated version, write the Konva JSON at
 * `annotations/<name>.konva.json`, and flag that screenshot `hasAnnotations`. Pure — inputs are not
 * mutated. No-op when the screenshot path is absent (e.g. it was removed).
 */
export function applyAnnotations(
  report: BugReportV1,
  assets: BugReportZipAssets,
  annotation: AnnotationExport,
): { report: BugReportV1; assets: BugReportZipAssets } {
  if (!assets.files.has(annotation.screenshotPath)) {
    return { report, assets };
  }
  const files = new Map(assets.files);
  files.set(annotation.screenshotPath, annotation.annotatedScreenshot);
  files.set(
    annotationFilePath(annotation.screenshotPath),
    JSON.stringify(annotation.annotationFile),
  );
  // Record the annotation in the report's manifest too (S3-15), appending to any existing one so
  // multiple annotated screenshots accumulate. Complements the per-screenshot `annotationsPath` flag.
  const annotations: AnnotationsManifest = {
    schemaVersion: 'v1',
    annotations: [...(report.annotations?.annotations ?? []), annotation.annotationFile],
  };
  return {
    report: {
      ...report,
      screenshots: flagAnnotated(report.screenshots, annotation.screenshotPath),
      annotations,
    },
    assets: { files },
  };
}

/**
 * Finalize phase: apply removals → apply every annotation (if any) → ZIP via the schema writer → download
 * with a timestamped filename. Runs in the service worker. Any failure resolves to `{ ok: false, reason }`.
 */
export async function finalizeReport(
  report: BugReportV1,
  assets: BugReportZipAssets,
  removedIds: readonly ArtifactId[],
  deps: FinalizeReportDeps,
  annotations?: AnnotationExport | readonly AnnotationExport[],
  removedInspectionIds?: readonly string[],
): Promise<CaptureFlowResult> {
  try {
    let trimmed = applyArtifactRemovals(report, assets, removedIds);
    trimmed = applyInspectionRemovals(trimmed.report, trimmed.assets, removedInspectionIds ?? []);
    // One entry per annotated screenshot — the primary shot and/or any element crops (BUG-05).
    // `applyAnnotations` is path-keyed and appends to the manifest, so folding them in sequence
    // accumulates correctly.
    const list = annotations ? (Array.isArray(annotations) ? annotations : [annotations]) : [];
    for (const annotation of list as readonly AnnotationExport[]) {
      trimmed = applyAnnotations(trimmed.report, trimmed.assets, annotation);
    }
    // Build the self-contained report.html from the final (trimmed + annotated) report + assets, so
    // the embedded viewer matches exactly what ships in the ZIP (S4-15).
    const reportHtml = deps.reportTemplateHtml
      ? await embedReportData({
          templateHtml: deps.reportTemplateHtml,
          report: trimmed.report,
          assets: trimmed.assets.files,
        })
      : undefined;
    const zip = await deps.writeZip(
      trimmed.report,
      trimmed.assets,
      reportHtml !== undefined ? { reportHtml } : {},
    );
    const filename = buildCaptureReportFilename(
      deps.now?.() ?? new Date(),
      trimmed.report.metadata.page.origin,
    );
    const downloadId = await deps.download(zip, filename);
    return { ok: true, downloadId, filename, byteSize: zip.size };
  } catch (error) {
    return { ok: false, reason: toReason(error) };
  }
}

/**
 * End-to-end one-shot capture: `captureReport` → `finalizeReport` (no removals). Runs in the
 * service worker. Any failure resolves to `{ ok: false, reason }`. (The preview flow holds the
 * captured report between these two phases instead of running them back-to-back.)
 */
export async function runCaptureFlow(
  input: CaptureFlowInput,
  deps: CaptureFlowDeps,
): Promise<CaptureFlowResult> {
  const captured = await captureReport(input, deps);
  if (!captured.ok || !captured.report || !captured.assets) {
    return { ok: false, ...(captured.reason ? { reason: captured.reason } : {}) };
  }
  const result = await finalizeReport(captured.report, captured.assets, [], deps);
  return result.ok && captured.debuggerNetwork
    ? { ...result, debuggerNetwork: captured.debuggerNetwork }
    : result;
}
