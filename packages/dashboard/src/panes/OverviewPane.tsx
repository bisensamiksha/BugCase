import type { BugReportV1, Severity } from '@bugcase/schema';
import type { ReactNode } from 'react';

import { AsyncState } from '../components/AsyncState';
import { renderMarkdownToSafeHtml } from '../lib/markdown';
import { formatHash } from '../router/hash-router';

import { consoleCounts, networkCounts, screenshotSummary } from './overview-metrics';

export interface OverviewPaneProps {
  readonly report: BugReportV1;
  /** Active report/tab id, used to build the deep-link into the Screenshots pane. */
  readonly reportId?: string | null;
}

const SEVERITY_BADGE: Record<Severity, string> = {
  // `fgMuted` on `surfaceMuted` is 4.34:1 — below AA. Minor is already de-emphasised by its neutral
  // field; muting the text as well made it the least readable badge of the three (S4-27).
  minor: 'bg-[var(--bc-surface-muted)] text-[var(--bc-fg)]',
  major: 'bg-[var(--bc-warning-bg-strong)] text-[var(--bc-warning-strong)]',
  critical: 'bg-[var(--bc-danger-bg-strong)] text-[var(--bc-danger-strong)]',
};

function capitalize(value: string): string {
  return value.length > 0 ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function Card({
  testid,
  title,
  children,
}: {
  readonly testid: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section
      data-testid={testid}
      className="rounded-[var(--bc-radius)] border border-[var(--bc-border)] bg-[var(--bc-surface)] p-3"
    >
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--bc-fg-muted)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-sm">
      <span className="shrink-0 text-[var(--bc-fg-muted)]">{label}</span>
      <span className="min-w-0 truncate text-right text-[var(--bc-fg)]">{value}</span>
    </div>
  );
}

function Empty({ children }: { readonly children: ReactNode }) {
  return <p className="text-sm text-[var(--bc-fg-muted)]">{children}</p>;
}

function MetricTile({
  testid,
  label,
  value,
  emphasizeWhenPositive = false,
}: {
  readonly testid: string;
  readonly label: string;
  readonly value: number;
  readonly emphasizeWhenPositive?: boolean;
}) {
  const emphasized = emphasizeWhenPositive && value > 0;
  return (
    <div
      data-testid={testid}
      className={`rounded-[var(--bc-radius)] border p-3 text-center ${
        emphasized
          ? 'border-[var(--bc-danger-border)] bg-[var(--bc-danger-bg)]'
          : 'border-[var(--bc-border)] bg-[var(--bc-surface)]'
      }`}
    >
      <div
        className={`text-2xl font-bold ${emphasized ? 'text-[var(--bc-danger)]' : 'text-[var(--bc-fg)]'}`}
      >
        {value}
      </div>
      {/*
        `fgMuted` is only contrast-audited against `bg`/`surface` (contrast.test.ts's MATRIX), not
        against `dangerBg` — on it, fgMuted reads at 4.35:1 in the light theme, just under the 4.5:1
        floor (S4-27 Task 15 axe finding). `dangerStrong` on `dangerBg` is an already-sanctioned pair
        (MATRIX doubles it as the control-boundary pair too), so the emphasized tile's label switches
        to it instead of staying on the unsanctioned combination.
      */}
      <div
        className={`mt-0.5 text-xs ${emphasized ? 'text-[var(--bc-danger-strong)]' : 'text-[var(--bc-fg-muted)]'}`}
      >
        {label}
      </div>
    </div>
  );
}

/**
 * Overview pane (S4-03). Renders everything derivable from the validated `report.json` — title,
 * severity, a screenshot summary, metadata cards, console/network counts, and sanitized Markdown
 * notes. The actual screenshot pixels are intentionally not read here: binary ZIP access arrives
 * with the `ReportSource` seam (S4-05) and is consumed by the Screenshots pane (S4-06). Every field
 * is accessed defensively so a partial/empty report renders without throwing.
 */
export function OverviewPane({ report, reportId }: OverviewPaneProps) {
  const meta = report.metadata;
  const page = meta?.page;
  const viewport = meta?.viewport;
  const browser = report.browser;
  const userInput = report.userInput;

  const title = userInput?.title || page?.title || 'Untitled report';
  const severity = userInput?.severity;
  const captureId = meta?.id;

  const cc = consoleCounts(report.console);
  const nc = networkCounts(report.network);
  const shots = screenshotSummary(report.screenshots);
  const notesHtml = renderMarkdownToSafeHtml(userInput?.notes ?? '');
  const screenshotsHref = formatHash({ activePane: 'screenshots', reportId: reportId ?? null });

  // The body is empty only for a degenerate/partial report; a real captured report always has a
  // page + screenshots manifest, so per-section empty states below cover real-but-incomplete data.
  const hasBody = Boolean(
    page || viewport || browser || shots.hero || cc.total > 0 || nc.total > 0 || notesHtml,
  );

  return (
    <section data-testid="overview-pane" className="h-full space-y-4 overflow-auto">
      {/* Header: title + severity + capture id */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-[var(--bc-fg)]">{title}</h2>
        {severity ? (
          <span
            data-testid="overview-severity"
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${SEVERITY_BADGE[severity]}`}
          >
            {capitalize(severity)}
          </span>
        ) : null}
        {captureId ? (
          <span
            data-testid="overview-capture-id"
            className="font-mono text-xs text-[var(--bc-fg-muted)]"
            title="Capture ID"
          >
            {captureId}
          </span>
        ) : null}
      </div>

      <AsyncState
        status={hasBody ? 'ready' : 'empty'}
        className="space-y-4"
        empty={
          <p data-testid="overview-empty" className="text-sm text-[var(--bc-fg-muted)]">
            No additional data was captured for this report.
          </p>
        }
      >
        {/* Hero screenshot summary (pixels render in the Screenshots pane — S4-06). */}
        {shots.hero ? (
          <a
            data-testid="overview-hero-link"
            href={screenshotsHref}
            className="block rounded-[var(--bc-radius)] border border-[var(--bc-border)] bg-[var(--bc-surface)] p-4 hover:border-[var(--bc-accent)]"
          >
            <div className="text-sm font-medium text-[var(--bc-fg)]">
              {capitalize(shots.hero.kind)} screenshot · {shots.hero.width}×{shots.hero.height} ·{' '}
              {shots.hero.captureMethod}
              {shots.hero.hasAnnotations ? ' · annotated' : ''}
            </div>
            {shots.elementCropCount > 0 ? (
              <div className="mt-1 text-xs text-[var(--bc-fg-muted)]">
                {shots.elementCropCount} element crop
                {shots.elementCropCount === 1 ? '' : 's'}
              </div>
            ) : null}
            <span className="mt-2 inline-block text-xs text-[var(--bc-accent)]">
              View in Screenshots →
            </span>
          </a>
        ) : (
          <div
            data-testid="overview-hero-empty"
            className="rounded-[var(--bc-radius)] border border-dashed border-[var(--bc-border)] p-4"
          >
            <Empty>No screenshot captured.</Empty>
          </div>
        )}

        {/* Metric tiles */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricTile
            testid="overview-metric-console-errors"
            label="Console errors"
            value={cc.errors}
            emphasizeWhenPositive
          />
          <MetricTile
            testid="overview-metric-console-warnings"
            label="Console warnings"
            value={cc.warnings}
          />
          <MetricTile
            testid="overview-metric-network-total"
            label="Network requests"
            value={nc.total}
          />
          <MetricTile
            testid="overview-metric-network-failed"
            label="Network failures"
            value={nc.failed}
            emphasizeWhenPositive
          />
        </div>

        {/* Metadata cards */}
        <div className="grid gap-3 md:grid-cols-3">
          <Card testid="overview-card-page" title="Page">
            {page ? (
              <>
                <Field label="Title" value={page.title || '-'} />
                <Field label="URL" value={page.url} />
                <Field label="Origin" value={page.origin} />
                <Field label="Captured" value={page.capturedAt} />
                <Field label="Referrer" value={page.referrer || '-'} />
              </>
            ) : (
              <Empty>Page metadata not captured.</Empty>
            )}
          </Card>

          <Card testid="overview-card-browser" title="Browser">
            {browser ? (
              <>
                <Field label="Target" value={meta?.tool?.browserBuildTarget ?? 'unknown'} />
                <Field label="Version" value={meta?.tool?.version ?? '-'} />
                <Field label="Timezone" value={browser.timezone} />
                <Field label="Languages" value={browser.languages.join(', ') || '-'} />
              </>
            ) : (
              <Empty>Browser info not captured.</Empty>
            )}
          </Card>

          <Card testid="overview-card-viewport" title="Viewport">
            {viewport ? (
              <>
                <Field label="Size" value={`${viewport.innerWidth}×${viewport.innerHeight}`} />
                <Field label="DPR" value={viewport.devicePixelRatio} />
                <Field label="Zoom" value={`${Math.round(viewport.zoomEstimate * 100)}%`} />
                <Field label="Screen" value={`${viewport.screenWidth}×${viewport.screenHeight}`} />
              </>
            ) : (
              <Empty>Viewport info not captured.</Empty>
            )}
          </Card>
        </div>

        {/* Sanitized Markdown notes */}
        <section aria-label="Notes">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--bc-fg-muted)]">
            Notes
          </h3>
          {notesHtml ? (
            <div
              data-testid="overview-notes"
              className="space-y-2 text-sm leading-relaxed text-[var(--bc-fg)] [&_a]:text-[var(--bc-accent)] [&_a]:underline [&_code]:font-mono [&_li]:ml-4 [&_li]:list-disc"
              // Sanitized by renderMarkdownToSafeHtml (marked + DOMPurify strict allowlist).
              dangerouslySetInnerHTML={{ __html: notesHtml }}
            />
          ) : (
            <p data-testid="overview-notes-empty" className="text-sm text-[var(--bc-fg-muted)]">
              No notes.
            </p>
          )}
        </section>
      </AsyncState>
    </section>
  );
}
