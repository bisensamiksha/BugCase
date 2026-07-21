/**
 * report.html generation + extraction helpers (S4-16).
 *
 * Reproduces S4-15's write path — embed the shared kitchen-sink fixture into the built template,
 * package a *real* ZIP, then pull `report.html` back out of it — and writes the result to a temp
 * file so a Playwright test can open it over `file://` exactly as a user would offline.
 *
 * These import the workspace package **source by relative path**. The Playwright runner executes
 * from the repo root, where bare `@bugcase/*` specifiers don't resolve (pnpm links workspace
 * packages only into each package's own `node_modules`, not the root) — the same reason the other
 * e2e helpers avoid them. Reaching into `src` is also required to load the ticket-mandated shared
 * fixture, which lives inside the report-template package.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import JSZip from 'jszip';

import {
  sampleAssets,
  sampleReport,
} from '../../../packages/report-template/src/__fixtures__/sample-report';
import { injectReportData } from '../../../packages/report-template/src/build-inline-html';
import { embedReportData } from '../../../packages/report-template/src/embed-data';
import { BUG_REPORT_ZIP_LAYOUT } from '../../../packages/schema/src/v1/zip-layout';
import { writeBugReportZip } from '../../../packages/schema/src/v1/zip-writer';

/** Absolute path to the built, self-contained empty-data report.html (real dashboard bundle). */
const BUILT_TEMPLATE_PATH = join(process.cwd(), 'packages/report-template/dist/report.html');

/** A pane's side-nav link + rendered root, so the spec can navigate to and assert each one. */
export interface ReportHtmlPane {
  readonly pane: string;
  /** `data-testid` of the side-nav link (AppShell). */
  readonly nav: string;
  /** `data-testid` of the pane's rendered root element. */
  readonly root: string;
}

/** All nine dashboard panes in side-nav order (mirrors `DASHBOARD_PANES` + each pane's root testid). */
export const REPORT_HTML_PANES: readonly ReportHtmlPane[] = [
  { pane: 'overview', nav: 'nav-overview', root: 'overview-pane' },
  { pane: 'screenshots', nav: 'nav-screenshots', root: 'screenshots-pane' },
  { pane: 'console', nav: 'nav-console', root: 'console-pane' },
  { pane: 'network', nav: 'nav-network', root: 'network-pane' },
  { pane: 'dom', nav: 'nav-dom', root: 'dom-snapshot-pane' },
  { pane: 'inspections', nav: 'nav-inspections', root: 'element-inspections-pane' },
  { pane: 'reproduction', nav: 'nav-reproduction', root: 'reproduction-pane' },
  { pane: 'storage', nav: 'nav-storage', root: 'storage-pane' },
  { pane: 'privacy', nav: 'nav-privacy', root: 'privacy-pane' },
];

/** Read the built empty-data report.html (its data placeholder is still `null` → renders the drop UI). */
function readBuiltTemplate(): string {
  try {
    return readFileSync(BUILT_TEMPLATE_PATH, 'utf8');
  } catch {
    throw new Error(
      `report.html not built at ${BUILT_TEMPLATE_PATH} — run ` +
        '`pnpm --filter @bugcase/report-template build` first',
    );
  }
}

/**
 * The full write path: embed the kitchen-sink fixture into the built template, package a real ZIP
 * via the S4-15 writer, then extract the `report.html` entry back out of that ZIP. The ZIP
 * round-trip is the point — this is "extract from a real ZIP", not a shortcut around it.
 */
export async function extractReportHtmlFromRealZip(): Promise<string> {
  const filled = await embedReportData({
    templateHtml: readBuiltTemplate(),
    report: sampleReport,
    assets: sampleAssets,
  });
  const zipBlob = await writeBugReportZip(
    sampleReport,
    { files: sampleAssets },
    { reportHtml: filled },
  );
  const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());
  const entry = zip.file(BUG_REPORT_ZIP_LAYOUT.reportHtml);
  if (!entry) {
    throw new Error(`ZIP is missing ${BUG_REPORT_ZIP_LAYOUT.reportHtml}`);
  }
  return entry.async('string');
}

/** The built template unchanged: `window.__BUG_REPORT__` is `null`, so the dashboard shows the drop UI. */
export function emptyDataReportHtml(): string {
  return readBuiltTemplate();
}

/**
 * A report.html whose injected payload is valid JSON but not a valid `BugReportV1` — the dashboard's
 * `parseInlineReportPayload` must reject it (returning `null`) and fall back to the drop UI without
 * throwing. The JSON is deliberately `<`-free so it is safe inside the classic data `<script>`.
 */
export function malformedPayloadReportHtml(): string {
  return injectReportData(readBuiltTemplate(), '{"report":{"nope":true},"assets":{}}');
}

/** A report.html written to disk, with the `file://` URL a browser can open it by. */
export interface TempReportHtml {
  readonly path: string;
  readonly url: string;
}

/** Create an isolated temp dir for this spec's generated report.html files. */
export function createReportHtmlTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'bugcase-report-html-'));
}

/** Write `html` into `dir` under `filename` and return its path + `file://` URL. */
export function writeReportHtml(dir: string, filename: string, html: string): TempReportHtml {
  const path = join(dir, filename);
  writeFileSync(path, html, 'utf8');
  return { path, url: pathToFileURL(path).href };
}

/** Remove the temp dir created by {@link createReportHtmlTempDir}. */
export function removeReportHtmlTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
