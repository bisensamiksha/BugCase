/**
 * REDACT_TEXT handler (BUG-04).
 *
 * Destructively removes an exact string from a held report — both `report.json` and the text assets
 * (the DOM snapshot html) — and writes the result back under the same `reportId`, so the subsequent
 * FINALIZE_REPORT zips the redacted version. Mirrors how Annotate bakes image redactions before
 * export: once applied, the original text is gone from the held report, not merely hidden.
 *
 * Binary assets (screenshots, element crops) are untouched by design — those are raw pixels the user
 * redacts by hand in Annotate (BUG-01).
 */

import { redactTextInAssets, redactTextInReport } from '@bugcase/schema';

import type { RedactTextRequest, RedactTextResponse } from './messages';
import type { HeldReport } from './report-hold';

export interface RedactTextDeps {
  readonly peek: (reportId: string) => HeldReport | undefined;
  readonly update: (reportId: string, held: HeldReport) => boolean;
}

export function handleRedactText(
  message: RedactTextRequest,
  deps: RedactTextDeps,
): Promise<RedactTextResponse> {
  const secret = typeof message.secret === 'string' ? message.secret : '';
  if (secret.trim().length === 0) {
    return Promise.resolve({ ok: false, reason: 'Enter the text to redact.' });
  }

  const held = deps.peek(message.reportId);
  if (!held) {
    // Same wording as finalize: the MV3 worker may have been evicted between capture and redaction.
    return Promise.resolve({ ok: false, reason: 'This capture expired before download.' });
  }

  // Assets first, so their hits can be folded into the single recorded total (the privacy pane
  // must show everything that was redacted, not just the `report.json` share).
  const assets = redactTextInAssets(held.assets.files, secret);
  const report = redactTextInReport(held.report, secret, { additionalHits: assets.hits });

  if (!deps.update(message.reportId, { report: report.report, assets: { files: assets.files } })) {
    return Promise.resolve({ ok: false, reason: 'This capture expired before download.' });
  }

  return Promise.resolve({
    ok: true,
    reportHits: report.hits,
    assetHits: assets.hits,
  });
}
