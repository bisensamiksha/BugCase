import type { BugReportV1, CaptureMetadata } from '@bugcase/schema';
import { summarizePrivacy } from '@bugcase/shared-ui';

import { AsyncState } from '../components/AsyncState';
import { downloadJson } from '../lib/export-json';

export interface PrivacyPaneProps {
  /** The open report (privacy facts all live in report.json — no ReportSource needed). */
  readonly report: BugReportV1;
  readonly reportId: string;
}

const HEADING = 'text-sm font-semibold text-[var(--bc-fg)]';
const MUTED = 'text-sm text-[var(--bc-fg-muted)]';
const TH = 'px-2 py-1 text-left text-xs font-semibold text-[var(--bc-fg-muted)]';
const TD = 'px-2 py-1 align-top text-xs text-[var(--bc-fg)]';
const DISCLOSURE =
  'rounded-[var(--bc-radius)] border border-[var(--bc-warning-border)] bg-[var(--bc-warning-bg)] ' +
  'p-3 text-sm text-[var(--bc-warning-on-bg)]';

/**
 * Privacy pane (S4-13): recorded evidence, not configured intent — the scrubber rules that
 * actually fired at capture (per-rule hits from `metadata.scrubbersApplied`), the permissions
 * held at capture, the schema version, and a privacy-summary JSON export. Absence of a rule
 * means it removed nothing: recording drops no-op rules by design.
 *
 * Scope honesty (BUG-01): the pipeline scrubbers only touch text (DOM/cookies/headers). Screenshots
 * and element crops are stored as rendered pixels and are NOT auto-scrubbed, so the pane must state
 * that plainly rather than imply the hit counts below are the whole privacy story.
 */
export function PrivacyPane({ report, reportId }: PrivacyPaneProps) {
  const summary = summarizePrivacy(report);
  const metadata = report.metadata as Partial<CaptureMetadata> | undefined;
  const capturedAt = metadata?.page?.capturedAt ?? null;
  const pageOrigin = metadata?.page?.origin ?? null;

  function onDownload(): void {
    downloadJson(`bugcase-privacy-summary-${reportId}.json`, {
      schemaVersion: report.schemaVersion,
      capturedAt,
      pageOrigin,
      permissions: summary.permissionsAtCapture,
      scrubbers: summary.scrubbers,
      totalScrubberHits: summary.totalScrubberHits,
    });
  }

  return (
    <section
      data-testid="privacy-pane"
      aria-label="Privacy"
      className="flex h-full flex-col gap-5 overflow-auto p-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--bc-fg)]">Privacy</h2>
          <p data-testid="privacy-facts" className={MUTED}>
            Schema {report.schemaVersion}
            {capturedAt ? ` · captured ${capturedAt}` : ''}
            {pageOrigin ? ` · ${pageOrigin}` : ''}
          </p>
        </div>
        <button
          type="button"
          data-testid="privacy-download"
          onClick={onDownload}
          className="rounded border border-[var(--bc-border-strong)] px-2 py-1 text-sm text-[var(--bc-fg)]"
        >
          Download privacy summary (JSON)
        </button>
      </header>

      <div data-testid="privacy-image-disclosure" role="note" className={DISCLOSURE}>
        <strong className="font-semibold">Screenshots and element crops are not scrubbed.</strong>{' '}
        They are stored as rendered images, so anything visible on screen when you captured —
        including a revealed password or other sensitive content — is saved as-is. Only the text
        surfaces below (page HTML, cookies, headers) are automatically scrubbed. Redact sensitive
        regions by hand in the extension before downloading a report you plan to share.
      </div>

      <section data-testid="privacy-scrubbers" aria-label="Scrubbers" className="space-y-2">
        <h3 className={HEADING}>Scrubbers</h3>
        <p data-testid="privacy-scrubber-total" className={MUTED}>
          {summary.totalScrubberHits} values scrubbed across {summary.scrubbers.length} rules.
        </p>
        {summary.scrubbers.length === 0 ? (
          <AsyncState
            status="empty"
            empty={<p className={MUTED}>No scrubber activity was recorded in this report.</p>}
          />
        ) : (
          <table className="w-full border-collapse">
            <caption className="sr-only">Scrubber rules that fired at capture</caption>
            <thead>
              <tr>
                <th scope="col" className={TH}>
                  Rule
                </th>
                <th scope="col" className={TH}>
                  Description
                </th>
                <th scope="col" className={TH}>
                  Hits
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.scrubbers.map((rule) => (
                <tr key={rule.id} className="border-t border-[var(--bc-border)]">
                  <td className={TD}>
                    <code>{rule.id}</code>
                  </td>
                  <td className={TD}>{rule.description}</td>
                  <td className={TD}>{rule.hits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className={MUTED}>
          Cookie and storage <em>values</em> in this report are additionally masked by always-on
          policy, independent of the rule hits above. This applies to the recorded text only — not
          to the image surfaces noted at the top of this pane.
        </p>
      </section>

      <section data-testid="privacy-permissions" aria-label="Permissions" className="space-y-2">
        <h3 className={HEADING}>Permissions at capture</h3>
        {summary.permissionsAtCapture.length === 0 ? (
          <AsyncState
            status="empty"
            empty={<p className={MUTED}>No permission state was recorded in this report.</p>}
          />
        ) : (
          <table className="w-full border-collapse">
            <caption className="sr-only">Permissions held when the capture ran</caption>
            <thead>
              <tr>
                <th scope="col" className={TH}>
                  Permission
                </th>
                <th scope="col" className={TH}>
                  State
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.permissionsAtCapture.map((permission) => (
                <tr key={permission.name} className="border-t border-[var(--bc-border)]">
                  <td className={TD}>
                    <code>{permission.name}</code>
                  </td>
                  <td className={TD}>{permission.grantedAtCapture ? 'Granted' : 'Not granted'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
