import type { BugReportV1 } from '@bugcase/schema';
import { describe, expect, it } from 'vitest';

import {
  buildArtifactList,
  formatBytes,
  type ArtifactId,
  type ReportArtifact,
} from './artifact-list';

function makeReport(overrides: Partial<BugReportV1> = {}): BugReportV1 {
  const base = {
    schemaVersion: 'v1',
    metadata: { page: { origin: 'https://example.com' } },
    userInput: {
      schemaVersion: 'v1',
      title: '',
      stepsToReproduce: '',
      severity: 'minor',
      notes: '',
    },
    screenshots: { schemaVersion: 'v1', elementCrops: [] },
    browser: null,
    console: null,
    network: null,
    dom: null,
    storage: null,
    cookies: null,
    navigation: null,
    reproduction: null,
    elementInspections: null,
  } as unknown as BugReportV1;
  return { ...base, ...overrides };
}

function byId(list: readonly ReportArtifact[], id: ArtifactId): ReportArtifact {
  const found = list.find((a) => a.id === id);
  if (!found) {
    throw new Error(`no artifact ${id}`);
  }
  return found;
}

describe('formatBytes', () => {
  it('formats bytes, KB, and MB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('buildArtifactList', () => {
  it('lists all artifacts in a fixed order', () => {
    const list = buildArtifactList({ report: makeReport() });
    expect(list.map((a) => a.id)).toEqual([
      'screenshot',
      'userInput',
      'browser',
      'console',
      'network',
      'dom',
      'storage',
      'cookies',
      'navigation',
      'metadata',
      'reproduction',
      'elementInspections',
    ]);
  });

  it('marks metadata and userInput present and non-removable', () => {
    const list = buildArtifactList({ report: makeReport() });
    expect(byId(list, 'metadata')).toMatchObject({ present: true, removable: false });
    expect(byId(list, 'userInput')).toMatchObject({ present: true, removable: false });
  });

  it('marks a null section as not present and not removable', () => {
    const list = buildArtifactList({ report: makeReport() });
    expect(byId(list, 'console')).toMatchObject({ present: false, removable: false, sizeBytes: 0 });
  });

  it('marks a collected section present, removable, and JSON-sized', () => {
    const report = makeReport({
      console: {
        schemaVersion: 'v1',
        entries: [],
        truncated: false,
        bufferSize: 200,
      } as unknown as BugReportV1['console'],
    });
    const consoleArtifact = byId(buildArtifactList({ report }), 'console');
    expect(consoleArtifact.present).toBe(true);
    expect(consoleArtifact.removable).toBe(true);
    expect(consoleArtifact.sizeBytes).toBeGreaterThan(0);
  });

  it('uses assetSizes for the screenshot and reports it present', () => {
    const report = makeReport({
      screenshots: {
        schemaVersion: 'v1',
        viewport: {
          path: 'screenshots/viewport.png',
          width: 1,
          height: 1,
          devicePixelRatio: 1,
          captureMethod: 'visibleTab',
          hasAnnotations: false,
        },
        elementCrops: [],
      } as unknown as BugReportV1['screenshots'],
    });
    const shot = byId(
      buildArtifactList({ report, assetSizes: { screenshot: 4096 } }),
      'screenshot',
    );
    expect(shot).toMatchObject({ present: true, removable: true, sizeBytes: 4096 });
  });
});
