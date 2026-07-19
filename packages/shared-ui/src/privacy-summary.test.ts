import type { BugReportV1 } from '@bugcase/schema';
import { describe, expect, it } from 'vitest';

import { summarizePrivacy } from './privacy-summary';

function makeReport(metadata: Record<string, unknown>): BugReportV1 {
  return { schemaVersion: 'v1', metadata } as unknown as BugReportV1;
}

describe('summarizePrivacy', () => {
  it('lists only the permissions that were granted at capture', () => {
    const summary = summarizePrivacy(
      makeReport({
        permissionsAtCapture: [
          { name: 'cookies', grantedAtCapture: true },
          { name: 'management', grantedAtCapture: false },
          { name: 'downloads', grantedAtCapture: true },
        ],
        scrubbersApplied: [],
      }),
    );
    expect(summary.permissions).toEqual(['cookies', 'downloads']);
  });

  it('summarizes every applied scrubber rule and totals their hits', () => {
    const summary = summarizePrivacy(
      makeReport({
        permissionsAtCapture: [],
        scrubbersApplied: [
          { id: 'dom-password-input-mask', description: 'Mask password inputs', hits: 2 },
          { id: 'dom-all-input-mask', description: 'Mask input values', hits: 0 },
          { id: 'header-auth-strip', description: 'Strip auth headers', hits: 3 },
        ],
      }),
    );
    expect(summary.scrubbers.map((s) => s.id)).toEqual([
      'dom-password-input-mask',
      'dom-all-input-mask',
      'header-auth-strip',
    ]);
    expect(summary.totalScrubberHits).toBe(5);
  });

  it('returns an empty summary without throwing when metadata fields are missing', () => {
    const summary = summarizePrivacy(makeReport({}));
    expect(summary.permissions).toEqual([]);
    expect(summary.permissionsAtCapture).toEqual([]);
    expect(summary.scrubbers).toEqual([]);
    expect(summary.totalScrubberHits).toBe(0);
  });

  it('surfaces the full permissionsAtCapture list (granted and not)', () => {
    const summary = summarizePrivacy(
      makeReport({
        permissionsAtCapture: [
          { name: 'cookies', grantedAtCapture: true },
          { name: 'debugger', grantedAtCapture: false },
        ],
        scrubbersApplied: [],
      }),
    );
    expect(summary.permissionsAtCapture).toEqual([
      { name: 'cookies', grantedAtCapture: true },
      { name: 'debugger', grantedAtCapture: false },
    ]);
    expect(summary.permissions).toEqual(['cookies']);
  });
});
