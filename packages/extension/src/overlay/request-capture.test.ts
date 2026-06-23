import type { CaptureMetadata } from '@bugcase/schema';
import { describe, expect, it, vi } from 'vitest';

// request-capture imports lib/browser for its defaults; stub the polyfill so import succeeds.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import { CAPTURE_REPORT, type CaptureReportRequest } from '../background/messages';
import { DEFAULT_USER_OPTIONS } from '../capture/metadata';

import { requestCapture } from './request-capture';

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
});
