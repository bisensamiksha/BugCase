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
import type { CapturedScreenshot } from '../capture/screenshot-strategy';

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

  it('stores a full-page screenshot in the fullPage slot, not viewport', async () => {
    const fullPageShot: CapturedScreenshot = {
      blob: new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }),
      dataUrl: 'data:image/png;base64,iVBORw==',
      width: 1280,
      height: 4000,
      devicePixelRatio: 2,
      captureMethod: 'scrollStitch',
    };
    const captureScreenshot = vi.fn(() => Promise.resolve(fullPageShot));
    const writeZip = vi.fn((_report: BugReportV1, _assets: BugReportZipAssets) =>
      Promise.resolve(new Blob([new Uint8Array([1])], { type: 'application/zip' })),
    );
    const download = vi.fn(() => Promise.resolve(9));

    const result = await runCaptureFlow(
      { metadata, userInput },
      { captureScreenshot, writeZip, download },
    );

    expect(result.ok).toBe(true);
    const [report, assets] = writeZip.mock.calls[0] ?? [];
    const parsed = BugReportV1Schema.parse(report);
    expect(parsed.screenshots.fullPage?.captureMethod).toBe('scrollStitch');
    expect(parsed.screenshots.viewport).toBeUndefined();
    expect(assets?.files.get(BUG_REPORT_ZIP_LAYOUT.screenshots.fullPage)).toBeInstanceOf(Blob);
  });

  it('invokes the optional debugger network capture and surfaces its result', async () => {
    const captureScreenshot = vi.fn(() => Promise.resolve(fakeShot()));
    const writeZip = vi.fn(() =>
      Promise.resolve(new Blob([new Uint8Array([1])], { type: 'application/zip' })),
    );
    const download = vi.fn(() => Promise.resolve(3));
    const debuggerResult = {
      ok: true,
      bodies: [
        {
          requestId: '1',
          url: 'https://example.com/api',
          mimeType: 'application/json',
          sizeBytes: 2,
          text: 'hi',
          truncated: false,
        },
      ],
    };
    const captureDebuggerNetwork = vi.fn(() => Promise.resolve(debuggerResult));

    const result = await runCaptureFlow(
      { metadata, userInput },
      { captureScreenshot, writeZip, download, captureDebuggerNetwork },
    );

    expect(captureDebuggerNetwork).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.debuggerNetwork).toEqual(debuggerResult);
  });

  it('records a DOM snapshot in report.dom and stores its scrubbed HTML', async () => {
    const domResult = {
      snapshot: {
        schemaVersion: 'v1' as const,
        contentPath: BUG_REPORT_ZIP_LAYOUT.raw.domSnapshot,
        byteSize: 21,
        scrubbed: true,
        scrubberHits: 1,
      },
      html: '<html>scrubbed</html>',
    };
    const captureScreenshot = vi.fn(() => Promise.resolve(fakeShot()));
    const writeZip = vi.fn((_report: BugReportV1, _assets: BugReportZipAssets) =>
      Promise.resolve(new Blob([new Uint8Array([1])], { type: 'application/zip' })),
    );
    const download = vi.fn(() => Promise.resolve(5));
    const collectDom = vi.fn(() => Promise.resolve(domResult));

    const result = await runCaptureFlow(
      { metadata, userInput },
      { captureScreenshot, writeZip, download, collectDom },
    );

    expect(result.ok).toBe(true);
    const [report, assets] = writeZip.mock.calls[0] ?? [];
    const parsed = BugReportV1Schema.parse(report);
    expect(parsed.dom?.contentPath).toBe(BUG_REPORT_ZIP_LAYOUT.raw.domSnapshot);
    expect(parsed.dom?.scrubberHits).toBe(1);
    expect(assets?.files.get(BUG_REPORT_ZIP_LAYOUT.raw.domSnapshot)).toBe('<html>scrubbed</html>');
  });

  it('records console and network logs in the report when provided', async () => {
    const consoleLog = {
      schemaVersion: 'v1' as const,
      capturedFromRingBuffer: true,
      capturedFromDebugger: false,
      bufferSize: 500,
      truncated: false,
      entries: [
        {
          id: 'c1',
          timestamp: '2026-06-27T12:00:00.000Z',
          level: 'error' as const,
          args: [{ type: 'string' as const, preview: 'boom' }],
        },
      ],
    };
    const networkLog = {
      schemaVersion: 'v1' as const,
      capturedFromRingBuffer: true,
      capturedFromDebugger: false,
      entries: [
        {
          id: 'n1',
          url: 'https://example.com/api',
          method: 'GET',
          status: 200,
          statusText: 'OK',
          initiator: 'fetch' as const,
          startedAt: '2026-06-27T12:00:00.000Z',
          endedAt: '2026-06-27T12:00:00.100Z',
          durationMs: 100,
          requestHeaders: [],
          responseHeaders: [],
          request: null,
          response: null,
          fromCache: false,
          failed: false,
          errorText: null,
        },
      ],
    };
    const captureScreenshot = vi.fn(() => Promise.resolve(fakeShot()));
    const writeZip = vi.fn((_report: BugReportV1, _assets: BugReportZipAssets) =>
      Promise.resolve(new Blob([new Uint8Array([1])], { type: 'application/zip' })),
    );
    const download = vi.fn(() => Promise.resolve(15));

    const result = await runCaptureFlow(
      { metadata, userInput, console: consoleLog, network: networkLog },
      { captureScreenshot, writeZip, download },
    );

    expect(result.ok).toBe(true);
    const [report] = writeZip.mock.calls[0] ?? [];
    const parsed = BugReportV1Schema.parse(report);
    expect(parsed.console?.entries[0]?.level).toBe('error');
    expect(parsed.network?.entries[0]?.url).toBe('https://example.com/api');
  });

  it('leaves console and network null when not provided', async () => {
    const captureScreenshot = vi.fn(() => Promise.resolve(fakeShot()));
    const writeZip = vi.fn((_report: BugReportV1, _assets: BugReportZipAssets) =>
      Promise.resolve(new Blob([new Uint8Array([1])], { type: 'application/zip' })),
    );
    const download = vi.fn(() => Promise.resolve(16));

    await runCaptureFlow({ metadata, userInput }, { captureScreenshot, writeZip, download });

    const [report] = writeZip.mock.calls[0] ?? [];
    const parsed = BugReportV1Schema.parse(report);
    expect(parsed.console).toBeNull();
    expect(parsed.network).toBeNull();
  });

  it('records browser info in report.browser when provided', async () => {
    const browserInfo = {
      schemaVersion: 'v1' as const,
      userAgent: 'UA-test',
      userAgentData: null,
      languages: ['en'],
      timezone: 'UTC',
      installedExtensions: null,
    };
    const captureScreenshot = vi.fn(() => Promise.resolve(fakeShot()));
    const writeZip = vi.fn((_report: BugReportV1, _assets: BugReportZipAssets) =>
      Promise.resolve(new Blob([new Uint8Array([1])], { type: 'application/zip' })),
    );
    const download = vi.fn(() => Promise.resolve(2));

    const result = await runCaptureFlow(
      { metadata, userInput, browser: browserInfo },
      { captureScreenshot, writeZip, download },
    );

    expect(result.ok).toBe(true);
    const [report] = writeZip.mock.calls[0] ?? [];
    const parsed = BugReportV1Schema.parse(report);
    expect(parsed.browser?.userAgent).toBe('UA-test');
  });

  it('records navigation history in report.navigation when provided', async () => {
    const navigation = {
      schemaVersion: 'v1' as const,
      entries: [
        { url: 'https://example.com/a', title: 'A', visitedAt: '2026-06-23T11:30:00.000Z' },
      ],
    };
    const captureScreenshot = vi.fn(() => Promise.resolve(fakeShot()));
    const writeZip = vi.fn((_report: BugReportV1, _assets: BugReportZipAssets) =>
      Promise.resolve(new Blob([new Uint8Array([1])], { type: 'application/zip' })),
    );
    const download = vi.fn(() => Promise.resolve(8));
    const collectNavigation = vi.fn(() => Promise.resolve(navigation));

    const result = await runCaptureFlow(
      { metadata, userInput },
      { captureScreenshot, writeZip, download, collectNavigation },
    );

    expect(result.ok).toBe(true);
    expect(collectNavigation).toHaveBeenCalledTimes(1);
    const [report] = writeZip.mock.calls[0] ?? [];
    const parsed = BugReportV1Schema.parse(report);
    expect(parsed.navigation?.entries).toHaveLength(1);
    expect(parsed.navigation?.entries[0]?.url).toBe('https://example.com/a');
  });

  it('records cookies in report.cookies, scoped to the captured page url', async () => {
    const cookies = {
      schemaVersion: 'v1' as const,
      entries: [
        {
          name: 'sid',
          value: '[scrubbed]',
          domain: 'example.com',
          path: '/',
          expiresAt: null,
          httpOnly: true,
          secure: true,
          sameSite: 'lax' as const,
          session: true,
          masked: true,
        },
      ],
    };
    const captureScreenshot = vi.fn(() => Promise.resolve(fakeShot()));
    const writeZip = vi.fn((_report: BugReportV1, _assets: BugReportZipAssets) =>
      Promise.resolve(new Blob([new Uint8Array([1])], { type: 'application/zip' })),
    );
    const download = vi.fn(() => Promise.resolve(9));
    const collectCookies = vi.fn((_url: string) => Promise.resolve(cookies));

    const result = await runCaptureFlow(
      { metadata, userInput },
      { captureScreenshot, writeZip, download, collectCookies },
    );

    expect(result.ok).toBe(true);
    expect(collectCookies).toHaveBeenCalledWith('https://example.com/path');
    const [report] = writeZip.mock.calls[0] ?? [];
    const parsed = BugReportV1Schema.parse(report);
    expect(parsed.cookies?.entries).toHaveLength(1);
    expect(parsed.cookies?.entries[0]?.name).toBe('sid');
    expect(parsed.cookies?.entries[0]?.masked).toBe(true);
  });

  it('records local/session storage in report.storage', async () => {
    const storage = {
      schemaVersion: 'v1' as const,
      localStorage: [{ key: 'theme', value: 'dark', sizeBytes: 4 }],
      sessionStorage: null,
      note: 'test note',
    };
    const captureScreenshot = vi.fn(() => Promise.resolve(fakeShot()));
    const writeZip = vi.fn((_report: BugReportV1, _assets: BugReportZipAssets) =>
      Promise.resolve(new Blob([new Uint8Array([1])], { type: 'application/zip' })),
    );
    const download = vi.fn(() => Promise.resolve(11));
    const collectStorage = vi.fn(() => Promise.resolve(storage));

    const result = await runCaptureFlow(
      { metadata, userInput },
      { captureScreenshot, writeZip, download, collectStorage },
    );

    expect(result.ok).toBe(true);
    expect(collectStorage).toHaveBeenCalledTimes(1);
    const [report] = writeZip.mock.calls[0] ?? [];
    const parsed = BugReportV1Schema.parse(report);
    expect(parsed.storage?.localStorage).toEqual([{ key: 'theme', value: 'dark', sizeBytes: 4 }]);
    expect(parsed.storage?.sessionStorage).toBeNull();
  });

  it('leaves report.storage null when no storage collector is provided', async () => {
    const captureScreenshot = vi.fn(() => Promise.resolve(fakeShot()));
    const writeZip = vi.fn((_report: BugReportV1, _assets: BugReportZipAssets) =>
      Promise.resolve(new Blob([new Uint8Array([1])], { type: 'application/zip' })),
    );
    const download = vi.fn(() => Promise.resolve(12));

    await runCaptureFlow({ metadata, userInput }, { captureScreenshot, writeZip, download });

    const [report] = writeZip.mock.calls[0] ?? [];
    expect(BugReportV1Schema.parse(report).storage).toBeNull();
  });

  it('folds collected extensions into report.browser.installedExtensions', async () => {
    const browserInfo = {
      schemaVersion: 'v1' as const,
      userAgent: 'UA-test',
      userAgentData: null,
      languages: ['en'],
      timezone: 'UTC',
      installedExtensions: null,
    };
    const extensions = [
      { id: 'other', name: 'Other', version: '1.0', enabled: true, type: 'extension' },
    ];
    const captureScreenshot = vi.fn(() => Promise.resolve(fakeShot()));
    const writeZip = vi.fn((_report: BugReportV1, _assets: BugReportZipAssets) =>
      Promise.resolve(new Blob([new Uint8Array([1])], { type: 'application/zip' })),
    );
    const download = vi.fn(() => Promise.resolve(11));
    const collectExtensions = vi.fn(() => Promise.resolve(extensions));

    const result = await runCaptureFlow(
      { metadata, userInput, browser: browserInfo },
      { captureScreenshot, writeZip, download, collectExtensions },
    );

    expect(result.ok).toBe(true);
    expect(collectExtensions).toHaveBeenCalledTimes(1);
    const [report] = writeZip.mock.calls[0] ?? [];
    const parsed = BugReportV1Schema.parse(report);
    expect(parsed.browser?.installedExtensions).toEqual(extensions);
  });

  it('preserves existing browser.installedExtensions when the collector returns null', async () => {
    const browserInfo = {
      schemaVersion: 'v1' as const,
      userAgent: 'UA-test',
      userAgentData: null,
      languages: ['en'],
      timezone: 'UTC',
      installedExtensions: [
        { id: 'pre', name: 'Pre', version: '1.0', enabled: true, type: 'extension' },
      ],
    };
    const captureScreenshot = vi.fn(() => Promise.resolve(fakeShot()));
    const writeZip = vi.fn((_report: BugReportV1, _assets: BugReportZipAssets) =>
      Promise.resolve(new Blob([new Uint8Array([1])], { type: 'application/zip' })),
    );
    const download = vi.fn(() => Promise.resolve(12));
    const collectExtensions = vi.fn(() => Promise.resolve(null));

    const result = await runCaptureFlow(
      { metadata, userInput, browser: browserInfo },
      { captureScreenshot, writeZip, download, collectExtensions },
    );

    expect(result.ok).toBe(true);
    const [report] = writeZip.mock.calls[0] ?? [];
    const parsed = BugReportV1Schema.parse(report);
    expect(parsed.browser?.installedExtensions).toEqual([
      { id: 'pre', name: 'Pre', version: '1.0', enabled: true, type: 'extension' },
    ]);
  });

  it('leaves report.browser null (dropping extensions) when no browser info was collected', async () => {
    const captureScreenshot = vi.fn(() => Promise.resolve(fakeShot()));
    const writeZip = vi.fn((_report: BugReportV1, _assets: BugReportZipAssets) =>
      Promise.resolve(new Blob([new Uint8Array([1])], { type: 'application/zip' })),
    );
    const download = vi.fn(() => Promise.resolve(13));
    const collectExtensions = vi.fn(() =>
      Promise.resolve([{ id: 'x', name: 'X', version: '1', enabled: true, type: 'extension' }]),
    );

    const result = await runCaptureFlow(
      { metadata, userInput },
      { captureScreenshot, writeZip, download, collectExtensions },
    );

    expect(result.ok).toBe(true);
    const [report] = writeZip.mock.calls[0] ?? [];
    const parsed = BugReportV1Schema.parse(report);
    expect(parsed.browser).toBeNull();
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
