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

import {
  applyAnnotations,
  applyArtifactRemovals,
  applyInspectionRemovals,
  captureReport,
  finalizeReport,
  runCaptureFlow,
  type AnnotationExport,
} from './capture-flow';

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

  it('embeds report.html into the ZIP when a report template is supplied', async () => {
    const captureScreenshot = vi.fn(() => Promise.resolve(fakeShot()));
    const writeZip = vi.fn(
      (_report: BugReportV1, _assets: BugReportZipAssets, _options?: { reportHtml?: string }) =>
        Promise.resolve(new Blob(['zip'])),
    );
    const download = vi.fn((_blob: Blob, _filename: string) => Promise.resolve(1));
    const reportTemplateHtml =
      '<script>window.__BUG_REPORT__ = /* @BUGCASE_REPORT_DATA@ */ null;</script>';

    await runCaptureFlow(
      { metadata, userInput },
      { captureScreenshot, writeZip, download, reportTemplateHtml },
    );

    const options = writeZip.mock.calls[0]?.[2];
    expect(options?.reportHtml).toContain('window.__BUG_REPORT__ = {');
    expect(options?.reportHtml).not.toContain('@BUGCASE_REPORT_DATA@');
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
      scrubbersApplied: [],
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

  it('records the reproduction recording in report.reproduction when provided', async () => {
    const reproduction = {
      schemaVersion: 'v1' as const,
      startedAt: '2026-07-04T10:00:00.000Z',
      endedAt: '2026-07-04T10:00:30.000Z',
      steps: [
        {
          id: 'r1',
          type: 'click' as const,
          selector: '#save',
          description: 'Clicked #save',
          timestamp: '2026-07-04T10:00:05.000Z',
          metadata: { tag: 'button' },
        },
      ],
    };
    const captureScreenshot = vi.fn(() => Promise.resolve(fakeShot()));
    const writeZip = vi.fn((_report: BugReportV1, _assets: BugReportZipAssets) =>
      Promise.resolve(new Blob([new Uint8Array([1])], { type: 'application/zip' })),
    );
    const download = vi.fn(() => Promise.resolve(3));

    const result = await runCaptureFlow(
      { metadata, userInput, reproduction },
      { captureScreenshot, writeZip, download },
    );

    expect(result.ok).toBe(true);
    const [report] = writeZip.mock.calls[0] ?? [];
    const parsed = BugReportV1Schema.parse(report);
    expect(parsed.reproduction?.steps[0]?.selector).toBe('#save');
  });

  it('leaves reproduction null when not provided', async () => {
    const captureScreenshot = vi.fn(() => Promise.resolve(fakeShot()));
    const writeZip = vi.fn((_report: BugReportV1, _assets: BugReportZipAssets) =>
      Promise.resolve(new Blob([new Uint8Array([1])], { type: 'application/zip' })),
    );
    const download = vi.fn(() => Promise.resolve(4));

    await runCaptureFlow({ metadata, userInput }, { captureScreenshot, writeZip, download });

    const [report] = writeZip.mock.calls[0] ?? [];
    expect(BugReportV1Schema.parse(report).reproduction).toBeNull();
  });

  it('folds picked element inspections + their crops into the report and ZIP', async () => {
    const elementInspections = [
      {
        outerHtml: '<button id="go">Go</button>',
        computedStyles: { display: 'flex' },
        boundingClientRect: { x: 1, y: 2, width: 100, height: 40 },
        ancestors: [{ tag: 'section', id: null, classes: [] as string[] }],
        cropDataUrl: 'data:image/png;base64,AAAA',
      },
    ];
    const captureScreenshot = vi.fn(() => Promise.resolve(fakeShot()));
    const writeZip = vi.fn((_report: BugReportV1, _assets: BugReportZipAssets) =>
      Promise.resolve(new Blob([new Uint8Array([1])], { type: 'application/zip' })),
    );
    const download = vi.fn(() => Promise.resolve(5));

    const result = await runCaptureFlow(
      { metadata, userInput, elementInspections },
      { captureScreenshot, writeZip, download },
    );

    expect(result.ok).toBe(true);
    const [report, assets] = writeZip.mock.calls[0] ?? [];
    const parsed = BugReportV1Schema.parse(report);
    expect(parsed.elementInspections?.inspections).toHaveLength(1);
    const cropPath = parsed.elementInspections?.inspections[0]?.screenshotCropPath ?? '';
    expect(cropPath).toMatch(/^screenshots\/crops\//);
    expect(parsed.screenshots.elementCrops).toHaveLength(1);
    expect(assets?.files.has(cropPath)).toBe(true);
  });

  it('leaves elementInspections null when none are provided', async () => {
    const captureScreenshot = vi.fn(() => Promise.resolve(fakeShot()));
    const writeZip = vi.fn((_report: BugReportV1, _assets: BugReportZipAssets) =>
      Promise.resolve(new Blob([new Uint8Array([1])], { type: 'application/zip' })),
    );
    const download = vi.fn(() => Promise.resolve(6));

    await runCaptureFlow({ metadata, userInput }, { captureScreenshot, writeZip, download });

    const [report] = writeZip.mock.calls[0] ?? [];
    expect(BugReportV1Schema.parse(report).elementInspections).toBeNull();
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
    const collectCookies = vi.fn((_url: string) =>
      Promise.resolve({ cookies, scrubbersApplied: [] }),
    );

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

describe('captureReport', () => {
  it('assembles a schema-valid report + assets without downloading', async () => {
    const captureScreenshot = vi.fn(() => Promise.resolve(fakeShot()));
    const captured = await captureReport({ metadata, userInput }, { captureScreenshot });

    expect(captured.ok).toBe(true);
    expect(captureScreenshot).toHaveBeenCalledTimes(1);
    const parsed = BugReportV1Schema.parse(captured.report);
    expect(parsed.screenshots.viewport?.path).toBe(BUG_REPORT_ZIP_LAYOUT.screenshots.viewport);
    expect(captured.assets?.files.has(BUG_REPORT_ZIP_LAYOUT.screenshots.viewport)).toBe(true);
    expect(captured.assetSizes?.screenshot).toBe(fakeShot().blob.size);
  });

  it('returns ok:false with a reason when the screenshot throws', async () => {
    const captureScreenshot = vi.fn(() => Promise.reject(new Error('denied')));
    const captured = await captureReport({ metadata, userInput }, { captureScreenshot });
    expect(captured).toEqual({ ok: false, reason: 'denied' });
  });

  it('merges DOM, cookie, and inspection scrubber hits with the overlay-carried ones', async () => {
    const captureScreenshot = vi.fn(() => Promise.resolve(fakeShot()));
    const captured = await captureReport(
      {
        metadata: {
          ...metadata,
          scrubbersApplied: [{ id: 'headers', description: 'Scrub headers', hits: 2 }],
        },
        userInput,
        elementInspections: [
          {
            outerHtml: '<input>',
            computedStyles: {},
            boundingClientRect: { x: 0, y: 0, width: 10, height: 10 },
            ancestors: [],
            cropDataUrl: null,
            scrubbersApplied: [{ id: 'dom-passwords', description: 'Mask passwords', hits: 1 }],
          },
        ],
      },
      {
        captureScreenshot,
        collectDom: () =>
          Promise.resolve({
            snapshot: {
              schemaVersion: 'v1',
              contentPath: BUG_REPORT_ZIP_LAYOUT.raw.domSnapshot,
              byteSize: 6,
              scrubbed: true,
              scrubberHits: 3,
            },
            html: '<html>',
            scrubbersApplied: [{ id: 'dom-passwords', description: 'Mask passwords', hits: 3 }],
          }),
        collectCookies: () =>
          Promise.resolve({
            cookies: { schemaVersion: 'v1', entries: [] },
            scrubbersApplied: [{ id: 'cookies', description: 'Mask cookie values', hits: 4 }],
          }),
      },
    );

    expect(captured.ok).toBe(true);
    expect(captured.report!.metadata.scrubbersApplied).toEqual([
      { id: 'headers', description: 'Scrub headers', hits: 2 },
      { id: 'dom-passwords', description: 'Mask passwords', hits: 4 },
      { id: 'cookies', description: 'Mask cookie values', hits: 4 },
    ]);
  });
});

describe('applyArtifactRemovals', () => {
  it('nulls a removed section and leaves others untouched', async () => {
    const captured = await captureReport(
      {
        metadata,
        userInput,
        console: {
          schemaVersion: 'v1',
          capturedFromRingBuffer: true,
          capturedFromDebugger: false,
          bufferSize: 200,
          truncated: false,
          entries: [],
        },
      },
      { captureScreenshot: () => Promise.resolve(fakeShot()) },
    );
    const { report } = applyArtifactRemovals(captured.report!, captured.assets!, ['console']);
    expect(report.console).toBeNull();
    expect(report.screenshots.viewport).toBeDefined();
  });

  it('drops the screenshot file and resets the manifest when screenshot is removed', async () => {
    const captured = await captureReport(
      { metadata, userInput },
      { captureScreenshot: () => Promise.resolve(fakeShot()) },
    );
    const { report, assets } = applyArtifactRemovals(captured.report!, captured.assets!, [
      'screenshot',
    ]);
    expect(report.screenshots.viewport).toBeUndefined();
    expect(assets.files.has(BUG_REPORT_ZIP_LAYOUT.screenshots.viewport)).toBe(false);
  });

  it('returns the same report + assets when nothing is removed', async () => {
    const captured = await captureReport(
      { metadata, userInput },
      { captureScreenshot: () => Promise.resolve(fakeShot()) },
    );
    const result = applyArtifactRemovals(captured.report!, captured.assets!, []);
    expect(result.report).toBe(captured.report);
    expect(result.assets).toBe(captured.assets);
  });
});

describe('finalizeReport', () => {
  it('zips and downloads a timestamped file, honouring removals', async () => {
    const zipBlob = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/zip' });
    const writeZip = vi.fn((_report: BugReportV1, _assets: BugReportZipAssets) =>
      Promise.resolve(zipBlob),
    );
    const download = vi.fn(() => Promise.resolve(9));
    const captured = await captureReport(
      { metadata, userInput },
      { captureScreenshot: () => Promise.resolve(fakeShot()) },
    );

    const result = await finalizeReport(captured.report!, captured.assets!, ['screenshot'], {
      writeZip,
      download,
      now: () => new Date('2026-06-13T09:08:07.000Z'),
    });

    expect(result).toEqual({
      ok: true,
      downloadId: 9,
      filename: 'bugcase-example-com-20260613-090807.zip',
      byteSize: zipBlob.size,
    });
    const [report, assets] = writeZip.mock.calls[0] ?? [];
    expect(report?.screenshots.viewport).toBeUndefined();
    expect(assets?.files.has(BUG_REPORT_ZIP_LAYOUT.screenshots.viewport)).toBe(false);
  });

  it('returns ok:false with a reason when writeZip throws', async () => {
    const captured = await captureReport(
      { metadata, userInput },
      { captureScreenshot: () => Promise.resolve(fakeShot()) },
    );
    const result = await finalizeReport(captured.report!, captured.assets!, [], {
      writeZip: () => Promise.reject(new Error('zip failed')),
      download: () => Promise.resolve(1),
    });
    expect(result).toEqual({ ok: false, reason: 'zip failed' });
  });
});

const VIEWPORT = BUG_REPORT_ZIP_LAYOUT.screenshots.viewport;

function annotationFor(): AnnotationExport {
  return {
    screenshotPath: VIEWPORT,
    annotatedScreenshot: new Blob([new Uint8Array([1, 1, 1])], { type: 'image/png' }),
    annotationFile: { schemaVersion: 'v1', screenshotPath: VIEWPORT, konvaJson: '{"k":1}' },
  };
}

describe('applyAnnotations', () => {
  it('replaces the screenshot blob, writes the annotations file, and flags hasAnnotations', async () => {
    const captured = await captureReport(
      { metadata, userInput },
      { captureScreenshot: () => Promise.resolve(fakeShot()) },
    );
    const ann = annotationFor();
    const { report, assets } = applyAnnotations(captured.report!, captured.assets!, ann);

    expect(assets.files.get(VIEWPORT)).toBe(ann.annotatedScreenshot);
    expect(assets.files.get('annotations/viewport.konva.json')).toBe(
      JSON.stringify(ann.annotationFile),
    );
    expect(report.screenshots.viewport?.hasAnnotations).toBe(true);
    expect(report.screenshots.viewport?.annotationsPath).toBe('annotations/viewport.konva.json');
    // S3-15: the applied annotation is also recorded in the report's annotations manifest.
    expect(report.annotations).toEqual({ schemaVersion: 'v1', annotations: [ann.annotationFile] });
  });

  it('accumulates multiple annotated screenshots into the manifest', async () => {
    const captured = await captureReport(
      { metadata, userInput },
      { captureScreenshot: () => Promise.resolve(fakeShot()) },
    );
    const first = applyAnnotations(captured.report!, captured.assets!, annotationFor());
    const secondAnn: AnnotationExport = {
      ...annotationFor(),
      konvaJson: '{"n":2}',
    } as AnnotationExport;
    const second = applyAnnotations(first.report, first.assets, secondAnn);
    expect(second.report.annotations?.annotations).toHaveLength(2);
  });

  it('leaves annotations null before any annotation is applied', async () => {
    const captured = await captureReport(
      { metadata, userInput },
      { captureScreenshot: () => Promise.resolve(fakeShot()) },
    );
    expect(captured.report!.annotations).toBeNull();
  });

  it('does not mutate the input report or assets', async () => {
    const captured = await captureReport(
      { metadata, userInput },
      { captureScreenshot: () => Promise.resolve(fakeShot()) },
    );
    const originalBlob = captured.assets!.files.get(VIEWPORT);
    applyAnnotations(captured.report!, captured.assets!, annotationFor());

    expect(captured.assets!.files.get(VIEWPORT)).toBe(originalBlob);
    expect(captured.assets!.files.has('annotations/viewport.konva.json')).toBe(false);
    expect(captured.report!.screenshots.viewport?.hasAnnotations).toBe(false);
  });

  it('no-ops when the screenshot path is not present', async () => {
    const captured = await captureReport(
      { metadata, userInput },
      { captureScreenshot: () => Promise.resolve(fakeShot()) },
    );
    const missing: AnnotationExport = {
      ...annotationFor(),
      screenshotPath: 'screenshots/nope.png',
    };
    const { assets } = applyAnnotations(captured.report!, captured.assets!, missing);
    expect(assets.files.has('annotations/nope.konva.json')).toBe(false);
    expect(assets.files.get(VIEWPORT)).toBe(captured.assets!.files.get(VIEWPORT));
  });
});

describe('finalizeReport — annotation', () => {
  it('zips the annotated screenshot and annotations file when an annotation is given', async () => {
    const writeZip = vi.fn((_r: BugReportV1, _a: BugReportZipAssets) =>
      Promise.resolve(new Blob([new Uint8Array([1])])),
    );
    const captured = await captureReport(
      { metadata, userInput },
      { captureScreenshot: () => Promise.resolve(fakeShot()) },
    );
    const ann = annotationFor();
    await finalizeReport(
      captured.report!,
      captured.assets!,
      [],
      { writeZip, download: () => Promise.resolve(1) },
      ann,
    );
    const [report, assets] = writeZip.mock.calls[0] ?? [];
    expect(assets?.files.get(VIEWPORT)).toBe(ann.annotatedScreenshot);
    expect(assets?.files.get('annotations/viewport.konva.json')).toBeDefined();
    expect(report?.screenshots.viewport?.hasAnnotations).toBe(true);
  });

  it('skips the annotation when the screenshot was removed', async () => {
    const writeZip = vi.fn((_r: BugReportV1, _a: BugReportZipAssets) =>
      Promise.resolve(new Blob([new Uint8Array([1])])),
    );
    const captured = await captureReport(
      { metadata, userInput },
      { captureScreenshot: () => Promise.resolve(fakeShot()) },
    );
    await finalizeReport(
      captured.report!,
      captured.assets!,
      ['screenshot'],
      { writeZip, download: () => Promise.resolve(1) },
      annotationFor(),
    );
    const [, assets] = writeZip.mock.calls[0] ?? [];
    expect(assets?.files.has(VIEWPORT)).toBe(false);
    expect(assets?.files.has('annotations/viewport.konva.json')).toBe(false);
  });
});

describe('applyInspectionRemovals (BUG-05)', () => {
  const base = {
    schemaVersion: 'v1',
    elementInspections: {
      schemaVersion: 'v1',
      inspections: [
        { id: 'i1', screenshotCropPath: 'screenshots/element-1.png' },
        { id: 'i2', screenshotCropPath: 'screenshots/element-2.png' },
      ],
    },
    screenshots: {
      schemaVersion: 'v1',
      elementCrops: [{ path: 'screenshots/element-1.png' }, { path: 'screenshots/element-2.png' }],
    },
  } as unknown as BugReportV1;

  const assets = () => ({
    files: new Map<string, Blob | string | Uint8Array>([
      ['screenshots/element-1.png', new Uint8Array([1])],
      ['screenshots/element-2.png', new Uint8Array([2])],
    ]),
  });

  it('drops the named inspection, its manifest entry, and its crop file', () => {
    const result = applyInspectionRemovals(base, assets(), ['i1']);
    expect(result.report.elementInspections?.inspections.map((i) => i.id)).toEqual(['i2']);
    expect(result.report.screenshots.elementCrops.map((c) => c.path)).toEqual([
      'screenshots/element-2.png',
    ]);
    expect(result.assets.files.has('screenshots/element-1.png')).toBe(false);
    expect(result.assets.files.has('screenshots/element-2.png')).toBe(true);
  });

  it('nulls the manifest when every inspection is removed', () => {
    const result = applyInspectionRemovals(base, assets(), ['i1', 'i2']);
    expect(result.report.elementInspections).toBeNull();
    expect(result.report.screenshots.elementCrops).toEqual([]);
    expect(result.assets.files.size).toBe(0);
  });

  it('is a no-op for an empty list or an unknown id', () => {
    expect(applyInspectionRemovals(base, assets(), []).report).toBe(base);
    expect(applyInspectionRemovals(base, assets(), ['nope']).report).toBe(base);
  });

  it('does not mutate the input report or assets', () => {
    const a = assets();
    applyInspectionRemovals(base, a, ['i1']);
    expect(base.elementInspections?.inspections).toHaveLength(2);
    expect(a.files.size).toBe(2);
  });
});
