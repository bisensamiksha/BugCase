import type {
  BugReportV1,
  CaptureMetadata,
  Permission,
  ScrubberRuleApplied,
} from '@bugcase/schema';

/** One scrubber rule that ran over the capture, with how many values it removed. */
export interface PrivacySummaryScrubber {
  readonly id: string;
  readonly description: string;
  readonly hits: number;
}

/** One permission as it stood at capture (granted or not) — evidence for the privacy pane. */
export interface PrivacySummaryPermission {
  readonly name: string;
  readonly grantedAtCapture: boolean;
}

/**
 * The privacy-relevant facts a user should confirm before the report leaves the preview:
 * which permissions were active while capturing, and which scrubbers ran (and what they removed).
 */
export interface PrivacySummary {
  /** Names of the permissions that were granted while the capture ran. */
  readonly permissions: readonly string[];
  /** Every permission as it stood at capture (granted or not), for evidence display. */
  readonly permissionsAtCapture: readonly PrivacySummaryPermission[];
  /** Scrubber rules that ran over the capture, in pipeline order, with their match counts. */
  readonly scrubbers: readonly PrivacySummaryScrubber[];
  /** Total number of values the scrubbers removed across every rule. */
  readonly totalScrubberHits: number;
}

/**
 * Derive a {@link PrivacySummary} from a report's capture metadata. Total and defensive:
 * a report whose metadata is partial or missing these arrays yields an empty summary rather
 * than throwing, so the consent modal renders cleanly for any capture.
 */
export function summarizePrivacy(report: BugReportV1): PrivacySummary {
  const metadata = report.metadata as Partial<CaptureMetadata> | undefined;
  const permissionsAtCapture: readonly Permission[] = metadata?.permissionsAtCapture ?? [];
  const scrubbersApplied: readonly ScrubberRuleApplied[] = metadata?.scrubbersApplied ?? [];

  const permissions = permissionsAtCapture.filter((p) => p.grantedAtCapture).map((p) => p.name);

  const scrubbers = scrubbersApplied.map((s) => ({
    id: s.id,
    description: s.description,
    hits: s.hits,
  }));

  const totalScrubberHits = scrubbers.reduce((sum, s) => sum + s.hits, 0);

  return {
    permissions,
    permissionsAtCapture: permissionsAtCapture.map((p) => ({
      name: p.name,
      grantedAtCapture: p.grantedAtCapture,
    })),
    scrubbers,
    totalScrubberHits,
  };
}
