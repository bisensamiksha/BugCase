import {
  BUG_REPORT_ZIP_LAYOUT,
  BugReportV1Schema,
  type BugReportV1,
  type BugReportZipAssets,
  type CaptureMetadata,
  type UserInput,
} from '@bugcase/schema';
import { describe, expect, it, vi } from 'vitest';

// runCaptureFlow injects its effects, but its module graph pulls in lib/browser via downloads.ts;
// the webextension-polyfill module throws at import outside an extension, so stub it.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import type { VisibleTabCapture } from '../capture/capture-visible-tab';
import { DEFAULT_USER_OPTIONS } from '../capture/metadata';

import { runCaptureFlow } from './capture-flow';

const metadata: CaptureMetadata = {
  id: '00000000-0000-4000-8000-000000000000',
  tool: { name: 'bugcase', version: '0.0.1', schemaVersion: 'v1', browserBuildTarget: 'chrome' },
  page: {
    url: 'https://example.com/path',
    title: 'Example',
    origin: 'https://example.com',
    capturedAt: '2026-06-13T12:00:00.000Z',
    referrer: null,
  },
  viewport: {
    innerWidth: 1280,
    innerHeight: 800,
    outerWidth: 1280,
    outerHeight: 900,
    devicePixelRatio: 2,
    zoomEstimate: 1,
    screenWidth: 1920,
    screenHeight: 1080,
    orientation: 'landscape-primary',
  },
  permissionsAtCapture: [],
  scrubbersApplied: [],
  userOptions: DEFAULT_USER_OPTIONS,
};

const userInput: UserInput = {
  schemaVersion: 'v1',
  title: '',
  stepsToReproduce: '',
  severity: 'minor',
  notes: '',
};

function fakeShot(): VisibleTabCapture {
  return {
    blob: new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }),
    dataUrl: 'data:image/png;base64,iVBORw==',
    width: 1280,
    height: 800,
    devicePixelRatio: 2,
    captureMethod: 'visibleTab',
  };
}

describe('runCaptureFlow', () => {
  it('captures, assembles a schema-valid report, zips it, and downloads a timestamped file', async () => {
    const zipBlob = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'application/zip' });
    const captureScreenshot = vi.fn(() => Promise.resolve(fakeShot()));
    const writeZip = vi.fn((_report: BugReportV1, _assets: BugReportZipAssets) =>
      Promise.resolve(zipBlob),
    );
    const download = vi.fn((_blob: Blob, _filename: string) => Promise.resolve(7));

    const result = await runCaptureFlow(
      { metadata, userInput },
      { captureScreenshot, writeZip, download, now: () => new Date('2026-06-13T09:08:07.000Z') },
    );

    expect(result).toEqual({
      ok: true,
      downloadId: 7,
      filename: 'bugcase-example-com-20260613-090807.zip',
      byteSize: zipBlob.size,
    });

    // The report handed to the writer is schema-valid and references the viewport screenshot.
    const [report, assets] = writeZip.mock.calls[0] ?? [];
    expect(report).toBeDefined();
    const parsed = BugReportV1Schema.parse(report);
    expect(parsed.metadata.id).toBe(metadata.id);
    expect(parsed.screenshots.viewport).toEqual({
      path: BUG_REPORT_ZIP_LAYOUT.screenshots.viewport,
      width: 1280,
      height: 800,
      devicePixelRatio: 2,
      captureMethod: 'visibleTab',
      hasAnnotations: false,
    });
    expect(assets?.files.get(BUG_REPORT_ZIP_LAYOUT.screenshots.viewport)).toBeInstanceOf(Blob);
    expect(download).toHaveBeenCalledWith(zipBlob, 'bugcase-example-com-20260613-090807.zip');
  });

  it('returns a handled failure (no throw, no download) when the screenshot fails', async () => {
    const captureScreenshot = vi.fn(() => Promise.reject(new Error('activeTab not granted')));
    const writeZip = vi.fn(() => Promise.resolve(new Blob()));
    const download = vi.fn(() => Promise.resolve(1));

    const result = await runCaptureFlow(
      { metadata, userInput },
      { captureScreenshot, writeZip, download },
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/activeTab/);
    expect(writeZip).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });
});
