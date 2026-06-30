import type { BugReportV1 } from '@bugcase/schema';
import { describe, expect, it } from 'vitest';

import { isJsonViewable, JSON_VIEWABLE_IDS, selectArtifactJson } from './artifact-json';

describe('JSON_VIEWABLE_IDS', () => {
  it('excludes screenshot and dom and includes the JSON sections', () => {
    expect(isJsonViewable('screenshot')).toBe(false);
    expect(isJsonViewable('dom')).toBe(false);
    for (const id of [
      'metadata',
      'console',
      'network',
      'cookies',
      'storage',
      'browser',
      'navigation',
      'userInput',
    ] as const) {
      expect(JSON_VIEWABLE_IDS.has(id)).toBe(true);
    }
  });
});

describe('selectArtifactJson', () => {
  const report = {
    metadata: { page: { url: 'u' } },
    console: { entries: [] },
    cookies: null,
  } as unknown as BugReportV1;

  it('returns the section for an id', () => {
    expect(selectArtifactJson(report, 'metadata')).toBe(report.metadata);
    expect(selectArtifactJson(report, 'console')).toBe(report.console);
    expect(selectArtifactJson(report, 'cookies')).toBeNull();
  });
});
