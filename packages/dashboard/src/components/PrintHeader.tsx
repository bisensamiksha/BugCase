import type { BugReportV1 } from '@bugcase/schema';

export interface PrintHeaderProps {
  /** The active report, or null when none is loaded. */
  readonly report: BugReportV1 | null | undefined;
}

const NOT_RECORDED = 'Not recorded';

/**
 * Identifying header for printed output (S4-25).
 *
 * Hidden on screen and revealed by `print.css`. Printing shows the pane in view; without this the
 * resulting PDF carries no indication of which capture it came from, which makes it useless as a
 * ticket attachment. Every field is read defensively — partial reports reach the panes too.
 */
export function PrintHeader({ report }: PrintHeaderProps) {
  if (!report) {
    return null;
  }

  const page = report.metadata?.page;
  const browser = report.metadata?.tool?.browserBuildTarget;

  return (
    <header data-testid="print-header" data-print-only className="hidden">
      <p className="text-sm font-bold">BugCase report</p>
      <p className="text-xs">{page?.url || NOT_RECORDED}</p>
      <p className="text-xs">
        {page?.capturedAt || NOT_RECORDED} · {browser || NOT_RECORDED}
      </p>
    </header>
  );
}
