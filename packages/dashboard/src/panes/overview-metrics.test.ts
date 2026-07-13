import type { ConsoleLog, NetworkLog, ScreenshotRef, ScreenshotsManifest } from '@bugcase/schema';
import { describe, expect, it } from 'vitest';

import { consoleCounts, networkCounts, screenshotSummary } from './overview-metrics';

function consoleLog(levels: readonly string[]): ConsoleLog {
  return {
    schemaVersion: 'v1',
    capturedFromRingBuffer: true,
    capturedFromDebugger: false,
    bufferSize: levels.length,
    truncated: false,
    entries: levels.map((level, i) => ({
      id: `c${i}`,
      timestamp: '2026-07-13T00:00:00.000Z',
      level,
      args: [{ type: 'string', preview: level }],
    })),
  } as unknown as ConsoleLog;
}

function networkLog(entries: readonly { failed?: boolean; status?: number | null }[]): NetworkLog {
  return {
    schemaVersion: 'v1',
    capturedFromRingBuffer: true,
    capturedFromDebugger: false,
    entries: entries.map((e, i) => ({
      id: `n${i}`,
      url: 'https://example.com',
      method: 'GET',
      status: e.status ?? 200,
      failed: e.failed ?? false,
    })),
  } as unknown as NetworkLog;
}

const ref = (over: Partial<ScreenshotRef> = {}): ScreenshotRef => ({
  path: 'screenshots/x.png',
  width: 100,
  height: 200,
  devicePixelRatio: 1,
  captureMethod: 'visibleTab',
  hasAnnotations: false,
  ...over,
});

describe('consoleCounts', () => {
  it('counts errors, warnings, and total', () => {
    expect(consoleCounts(consoleLog(['error', 'warn', 'log', 'error', 'info']))).toEqual({
      total: 5,
      errors: 2,
      warnings: 1,
    });
  });

  it('returns zeros for a null or undefined log', () => {
    expect(consoleCounts(null)).toEqual({ total: 0, errors: 0, warnings: 0 });
    expect(consoleCounts(undefined)).toEqual({ total: 0, errors: 0, warnings: 0 });
  });
});

describe('networkCounts', () => {
  it('counts total and treats an explicit failed flag or a >=400 status as failed', () => {
    const log = networkLog([
      { status: 200 },
      { status: 404 },
      { status: 500 },
      { failed: true, status: null },
      { failed: false, status: 302 },
    ]);
    expect(networkCounts(log)).toEqual({ total: 5, failed: 3 });
  });

  it('returns zeros for a null or undefined log', () => {
    expect(networkCounts(null)).toEqual({ total: 0, failed: 0 });
    expect(networkCounts(undefined)).toEqual({ total: 0, failed: 0 });
  });
});

describe('screenshotSummary', () => {
  it('picks fullPage as the hero over viewport and lists all present shots', () => {
    const manifest: ScreenshotsManifest = {
      schemaVersion: 'v1',
      viewport: ref({ captureMethod: 'visibleTab' }),
      fullPage: ref({ captureMethod: 'scrollStitch' }),
      elementCrops: [ref(), ref()],
    };
    const summary = screenshotSummary(manifest);
    expect(summary.hero?.kind).toBe('fullPage');
    expect(summary.elementCropCount).toBe(2);
    expect(summary.items.map((i) => i.kind)).toEqual([
      'fullPage',
      'viewport',
      'elementCrop',
      'elementCrop',
    ]);
  });

  it('falls back to viewport as the hero when there is no fullPage shot', () => {
    const summary = screenshotSummary({
      schemaVersion: 'v1',
      viewport: ref(),
      elementCrops: [],
    });
    expect(summary.hero?.kind).toBe('viewport');
    expect(summary.elementCropCount).toBe(0);
  });

  it('returns an empty summary for a null, undefined, or empty manifest', () => {
    for (const input of [
      null,
      undefined,
      { schemaVersion: 'v1', elementCrops: [] } as ScreenshotsManifest,
    ]) {
      const summary = screenshotSummary(input);
      expect(summary.hero).toBeNull();
      expect(summary.items).toEqual([]);
      expect(summary.elementCropCount).toBe(0);
    }
  });
});
