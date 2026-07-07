import type { CaptureMetadata, UserOptions } from '@bugcase/schema';
import { describe, expect, it, vi } from 'vitest';

// request-capture imports lib/browser for its defaults; stub the polyfill so import succeeds.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import {
  CAPTURE_REPORT,
  FINALIZE_REPORT,
  PEEK_REPORT_ASSET,
  type CaptureReportRequest,
  type FinalizeReportRequest,
} from '../background/messages';
import { DEFAULT_USER_OPTIONS } from '../capture/metadata';

import { requestCapture, requestFinalize, requestPeekAsset } from './request-capture';

const metadata: CaptureMetadata = {
  id: '00000000-0000-4000-8000-000000000000',
  tool: { name: 'bugcase', version: '0.0.1', schemaVersion: 'v1', browserBuildTarget: 'chrome' },
  page: {
    url: 'https://example.com/',
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

describe('requestCapture', () => {
  it('collects metadata and sends a CAPTURE_REPORT message with default user input', async () => {
    const collectMetadata = vi.fn(() => Promise.resolve(metadata));
    const send = vi.fn((_message: CaptureReportRequest) =>
      Promise.resolve({ ok: true, downloadId: 3, filename: 'x.zip' }),
    );

    const result = await requestCapture({ collectMetadata, send });

    expect(result).toEqual({ ok: true, downloadId: 3, filename: 'x.zip' });
    expect(send).toHaveBeenCalledTimes(1);
    const msg = send.mock.calls[0]?.[0];
    expect(msg?.type).toBe(CAPTURE_REPORT);
    expect(msg?.metadata).toBe(metadata);
    expect(msg?.userInput).toEqual({
      schemaVersion: 'v1',
      title: '',
      stepsToReproduce: '',
      severity: 'minor',
      notes: '',
    });
  });

  it('collects and forwards browser info', async () => {
    const browserInfo = {
      schemaVersion: 'v1' as const,
      userAgent: 'UA-X',
      userAgentData: null,
      languages: ['en'],
      timezone: 'UTC',
      installedExtensions: null,
    };
    const collectMetadata = vi.fn(() => Promise.resolve(metadata));
    const collectBrowserInfo = vi.fn(() => Promise.resolve(browserInfo));
    const send = vi.fn((_message: CaptureReportRequest) => Promise.resolve({ ok: true }));

    await requestCapture({ collectMetadata, collectBrowserInfo, send });

    expect(collectBrowserInfo).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]?.browser).toEqual(browserInfo);
  });

  it('passes through provided user input', async () => {
    const collectMetadata = vi.fn(() => Promise.resolve(metadata));
    const send = vi.fn((_message: CaptureReportRequest) => Promise.resolve({ ok: true }));

    await requestCapture({
      collectMetadata,
      send,
      userInput: {
        schemaVersion: 'v1',
        title: 'Crash',
        stepsToReproduce: 'click',
        severity: 'major',
        notes: 'n',
      },
    });

    const msg = send.mock.calls[0]?.[0];
    expect(msg?.userInput.severity).toBe('major');
    expect(msg?.userInput.title).toBe('Crash');
  });

  it('flushes and includes the console log when consoleLogs is enabled', async () => {
    const collectMetadata = vi.fn(() => Promise.resolve(metadata));
    const send = vi.fn((_message: CaptureReportRequest) => Promise.resolve({ ok: true }));
    const flushChannel = vi.fn((channel: 'console' | 'network' | 'reproduction') =>
      Promise.resolve(
        channel === 'console'
          ? [{ type: 'console', level: 'warn', args: ['hi'], timestamp: Date.now() }]
          : [],
      ),
    );

    await requestCapture({
      collectMetadata,
      send,
      flushChannel,
      userOptions: { ...DEFAULT_USER_OPTIONS, consoleLogs: true },
    });

    expect(flushChannel).toHaveBeenCalledWith('console');
    const msg = send.mock.calls[0]?.[0];
    expect(msg?.console?.entries[0]?.level).toBe('warn');
    expect(msg?.network).toBeNull();
  });

  it('flushes, scrubs, and merges network scrubber stats into metadata when networkLog is enabled', async () => {
    const collectMetadata = vi.fn(() => Promise.resolve(metadata));
    const send = vi.fn((_message: CaptureReportRequest) => Promise.resolve({ ok: true }));
    const networkRaw = {
      initiator: 'fetch',
      url: 'https://example.com/api',
      method: 'GET',
      status: 200,
      statusText: 'OK',
      requestHeaders: [{ name: 'Authorization', value: 'Bearer secret' }],
      responseHeaders: [],
      startedAt: Date.now(),
      endedAt: Date.now(),
      durationMs: 10,
      failed: false,
      errorText: null,
    };
    const flushChannel = vi.fn((channel: 'console' | 'network' | 'reproduction') =>
      Promise.resolve(channel === 'network' ? [networkRaw] : []),
    );

    await requestCapture({
      collectMetadata,
      send,
      flushChannel,
      userOptions: { ...DEFAULT_USER_OPTIONS, networkLog: true },
    });

    const msg = send.mock.calls[0]?.[0];
    expect(msg?.network?.entries[0]?.requestHeaders).toContainEqual({
      name: 'Authorization',
      value: '[scrubbed]',
    });
    expect(msg?.metadata.scrubbersApplied.some((s) => s.id === 'header-secret-mask')).toBe(true);
  });

  it('does not flush the ring buffers when console/network options are off', async () => {
    const collectMetadata = vi.fn(() => Promise.resolve(metadata));
    const send = vi.fn((_message: CaptureReportRequest) => Promise.resolve({ ok: true }));
    const flushChannel = vi.fn(() => Promise.resolve([]));

    await requestCapture({
      collectMetadata,
      send,
      flushChannel,
      userOptions: DEFAULT_USER_OPTIONS,
    });

    expect(flushChannel).not.toHaveBeenCalled();
    const msg = send.mock.calls[0]?.[0];
    expect(msg?.console).toBeNull();
    expect(msg?.network).toBeNull();
  });

  it('forwards a reproduction recording (assembled by the overlay) into the message', async () => {
    const collectMetadata = vi.fn(() => Promise.resolve(metadata));
    const send = vi.fn((_message: CaptureReportRequest) => Promise.resolve({ ok: true }));
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

    await requestCapture({ collectMetadata, send, reproduction });

    const msg = send.mock.calls[0]?.[0];
    expect(msg?.reproduction?.steps[0]?.selector).toBe('#save');
    expect(msg?.reproduction?.startedAt).toBe('2026-07-04T10:00:00.000Z');
  });

  it('omits reproduction when the overlay has none', async () => {
    const collectMetadata = vi.fn(() => Promise.resolve(metadata));
    const send = vi.fn((_message: CaptureReportRequest) => Promise.resolve({ ok: true }));

    await requestCapture({ collectMetadata, send });

    const msg = send.mock.calls[0]?.[0];
    expect(msg?.reproduction ?? null).toBeNull();
  });

  it('forwards picked element inspections into the message', async () => {
    const collectMetadata = vi.fn(() => Promise.resolve(metadata));
    const send = vi.fn((_message: CaptureReportRequest) => Promise.resolve({ ok: true }));
    const elementInspections = [
      {
        outerHtml: '<button/>',
        computedStyles: {},
        boundingClientRect: { x: 0, y: 0, width: 1, height: 1 },
        ancestors: [],
        cropDataUrl: 'data:image/png;base64,AA',
      },
    ];

    await requestCapture({ collectMetadata, send, elementInspections });

    expect(send.mock.calls[0]?.[0]?.elementInspections).toEqual(elementInspections);
  });

  it('omits elementInspections when none were picked', async () => {
    const collectMetadata = vi.fn(() => Promise.resolve(metadata));
    const send = vi.fn((_message: CaptureReportRequest) => Promise.resolve({ ok: true }));

    await requestCapture({ collectMetadata, send, elementInspections: [] });

    expect(send.mock.calls[0]?.[0]?.elementInspections ?? null).toBeNull();
  });

  it('threads userOptions into the metadata collector', async () => {
    const collectMetadata = vi.fn((_userOptions?: UserOptions) => Promise.resolve(metadata));
    const send = vi.fn((_message: CaptureReportRequest) => Promise.resolve({ ok: true }));
    const userOptions = { ...DEFAULT_USER_OPTIONS, cookies: true };

    await requestCapture({ collectMetadata, send, userOptions });

    expect(collectMetadata).toHaveBeenCalledWith(userOptions);
  });
});

describe('requestFinalize', () => {
  it('sends a FINALIZE_REPORT message with the report id and removed ids', async () => {
    const send = vi.fn((_message: FinalizeReportRequest) =>
      Promise.resolve({ ok: true, downloadId: 3, filename: 'f.zip' }),
    );

    const result = await requestFinalize('r1', ['console', 'cookies'], undefined, send);

    expect(result).toEqual({ ok: true, downloadId: 3, filename: 'f.zip' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toEqual({
      type: FINALIZE_REPORT,
      reportId: 'r1',
      removedIds: ['console', 'cookies'],
    });
  });

  it('forwards the annotation payload when one is provided', async () => {
    const send = vi.fn((_message: FinalizeReportRequest) => Promise.resolve({ ok: true }));
    const annotation = { konvaJson: '{"k":1}', screenshotDataUrl: 'data:image/png;base64,AAAA' };

    await requestFinalize('r1', [], annotation, send);

    expect(send.mock.calls[0]?.[0]).toEqual({
      type: FINALIZE_REPORT,
      reportId: 'r1',
      removedIds: [],
      annotation,
    });
  });
});

describe('requestPeekAsset', () => {
  it('sends a PEEK_REPORT_ASSET message and returns the response', async () => {
    const send = vi.fn(() => Promise.resolve({ ok: true, dataUrl: 'data:image/png;base64,AA' }));
    const res = await requestPeekAsset('r1', 'raw/s.png', send);
    expect(send).toHaveBeenCalledWith({
      type: PEEK_REPORT_ASSET,
      reportId: 'r1',
      path: 'raw/s.png',
    });
    expect(res).toEqual({ ok: true, dataUrl: 'data:image/png;base64,AA' });
  });
});
