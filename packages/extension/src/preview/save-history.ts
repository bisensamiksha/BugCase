import type { BugReportV1 } from '@bugcase/schema';

import {
  appendReportHistory,
  type HistoryDeps,
  type ReportHistoryEntry,
} from '../storage/report-history';

import { buildArtifactList, type ArtifactId } from './artifact-list';

/** What `PreviewApp` knows after a successful download: the held report + the finalize result. */
export interface DownloadedReportInput {
  readonly report: BugReportV1;
  readonly removedIds: readonly ArtifactId[];
  readonly filename: string;
  readonly byteSize: number;
  readonly downloadId: number | null;
}

/**
 * Build the metadata-only history entry for a just-downloaded report. Pure. The recorded `artifacts` are
 * the sections actually shipped — every present artifact that the user did not remove — computed with the
 * same `buildArtifactList` presence logic the preview uses.
 */
export function buildHistoryEntry(input: DownloadedReportInput): ReportHistoryEntry {
  const removed = new Set(input.removedIds);
  const artifacts = buildArtifactList({ report: input.report })
    .filter((a) => a.present && !removed.has(a.id))
    .map((a) => a.id);
  const page = input.report.metadata.page;
  return {
    id: input.report.metadata.id,
    capturedAt: page.capturedAt,
    url: page.url,
    title: page.title,
    origin: page.origin,
    filename: input.filename,
    byteSize: input.byteSize,
    artifacts,
    downloadId: input.downloadId,
    toolVersion: input.report.metadata.tool.version,
  };
}

/**
 * Record a downloaded report in the metadata-only history. **Best-effort** — any failure (malformed
 * report, storage rejection) is swallowed so it can never block or surface an error into the download flow.
 */
export async function saveDownloadedReport(
  input: DownloadedReportInput,
  deps: HistoryDeps = {},
): Promise<void> {
  try {
    await appendReportHistory(buildHistoryEntry(input), deps);
  } catch {
    // best-effort: history must never break the download UX
  }
}
