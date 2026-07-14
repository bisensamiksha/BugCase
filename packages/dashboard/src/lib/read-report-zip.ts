import { BUG_REPORT_ZIP_LAYOUT, BugReportV1Schema, type BugReportV1 } from '@bugcase/schema';
import JSZip from 'jszip';

import { createReportSource, type ReportSource } from './report-source';

export type ReadReportResult =
  | { readonly ok: true; readonly source: ReportSource }
  | { readonly ok: false; readonly error: string };

/**
 * Read a BugCase report ZIP entirely client-side: parse with JSZip, pull the canonical
 * `report.json`, and validate it against `BugReportV1Schema`. Every failure mode (not a ZIP,
 * missing/!JSON/invalid report) resolves to `{ ok: false, error }` instead of throwing.
 */
export async function readReportZip(
  input: Blob | ArrayBuffer | Uint8Array,
): Promise<ReadReportResult> {
  let zip: JSZip;
  try {
    // JSZip reads Blobs via FileReader (browser-only); hand it bytes so it also works under Node/tests.
    const data = input instanceof Blob ? await input.arrayBuffer() : input;
    zip = await JSZip.loadAsync(data);
  } catch {
    return { ok: false, error: 'File is not a valid ZIP archive' };
  }

  const reportFile = zip.file(BUG_REPORT_ZIP_LAYOUT.report);
  if (!reportFile) {
    return { ok: false, error: `ZIP is missing ${BUG_REPORT_ZIP_LAYOUT.report}` };
  }

  const text = await reportFile.async('string');

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: `${BUG_REPORT_ZIP_LAYOUT.report} is not valid JSON` };
  }

  const parsed = BugReportV1Schema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.join('.') ?? '';
    return {
      ok: false,
      error: `Report failed schema validation${where ? ` at "${where}"` : ''}: ${first?.message ?? 'invalid'}`,
    };
  }

  // The Zod-inferred type widens optional fields to `| undefined`; the validated data conforms to
  // the hand-written BugReportV1 interface (S1-06 keeps them in sync), so narrow it back. The JSZip
  // handle is retained by the ReportSource so panes can read binary entries lazily (S4-05).
  return { ok: true, source: createReportSource(zip, parsed.data as BugReportV1) };
}
