import JSZip from 'jszip';

import type { BugReportV1 } from './report';
import { BUG_REPORT_ZIP_LAYOUT } from './zip-layout';

/**
 * Binary / text artifacts that accompany the report inside the ZIP, keyed by their
 * canonical path (see {@link BUG_REPORT_ZIP_LAYOUT}). Values may be a string, raw
 * bytes, or a Blob — the writer normalizes them so it works in both a browser tab
 * and an MV3 service worker.
 */
export interface BugReportZipAssets {
  readonly files: ReadonlyMap<string, Blob | string | Uint8Array>;
}

/** Optional extras for the ZIP writer. */
export interface WriteBugReportZipOptions {
  /** Pre-rendered self-contained report.html (S4-15); written at `report.html` when present. */
  readonly reportHtml?: string;
}

/**
 * Fixed entry timestamp so the same input always produces byte-identical output.
 * (Reproducible build hashes are formalized later in S4-27; deterministic ordering
 * and content are required here.)
 */
const DETERMINISTIC_DATE = new Date('2020-01-01T00:00:00.000Z');

const EMPTY_ASSETS: BugReportZipAssets = { files: new Map() };

/** Normalize a Blob to bytes; pass strings and Uint8Array through untouched. */
async function toZipData(data: Blob | string | Uint8Array): Promise<string | Uint8Array> {
  if (typeof data === 'string' || data instanceof Uint8Array) {
    return data;
  }
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * Build a deterministic BugReport ZIP as a Blob.
 *
 * The report is serialized to the canonical `report.json` (and `metadata.json`)
 * paths, then caller-supplied {@link BugReportZipAssets} are added. Entries are
 * written in sorted path order with a fixed timestamp and no compression, so the
 * output is stable across runs. Uses only web-platform APIs (JSZip, Blob,
 * Uint8Array) — safe in an MV3 service worker, no Node APIs required.
 */
export async function writeBugReportZip(
  report: BugReportV1,
  assets: BugReportZipAssets = EMPTY_ASSETS,
  options: WriteBugReportZipOptions = {},
): Promise<Blob> {
  // Collect every entry first so canonical documents win over any colliding asset path.
  const entries = new Map<string, Blob | string | Uint8Array>(assets.files);
  entries.set(BUG_REPORT_ZIP_LAYOUT.report, JSON.stringify(report, null, 2));
  entries.set(BUG_REPORT_ZIP_LAYOUT.metadata, JSON.stringify(report.metadata, null, 2));
  if (options.reportHtml !== undefined) {
    entries.set(BUG_REPORT_ZIP_LAYOUT.reportHtml, options.reportHtml);
  }

  const zip = new JSZip();
  for (const path of [...entries.keys()].sort()) {
    // Non-null: path comes from entries.keys(), so the lookup always resolves.
    const data = await toZipData(entries.get(path) as Blob | string | Uint8Array);
    zip.file(path, data, { date: DETERMINISTIC_DATE });
  }

  const buffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'STORE' });
  return new Blob([buffer], { type: 'application/zip' });
}
