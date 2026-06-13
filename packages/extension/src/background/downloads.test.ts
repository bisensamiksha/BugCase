import { beforeEach, describe, expect, it, vi } from 'vitest';

const { download } = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock('webextension-polyfill', () => ({ default: { downloads: { download } } }));

import { buildCaptureReportFilename, downloadBlob } from './downloads';

describe('buildCaptureReportFilename', () => {
  it('builds a timestamped, origin-slugged zip filename in UTC', () => {
    expect(
      buildCaptureReportFilename(new Date('2026-06-13T09:08:07.000Z'), 'https://example.com'),
    ).toBe('bugcase-example-com-20260613-090807.zip');
  });

  it('falls back to "capture" when the origin is missing or unparseable', () => {
    expect(buildCaptureReportFilename(new Date('2026-01-02T03:04:05.000Z'), '')).toBe(
      'bugcase-capture-20260102-030405.zip',
    );
    expect(buildCaptureReportFilename(new Date('2026-01-02T03:04:05.000Z'))).toBe(
      'bugcase-capture-20260102-030405.zip',
    );
  });
});

describe('downloadBlob', () => {
  beforeEach(() => download.mockReset());

  it('downloads the blob as a base64 data URL and returns the download id', async () => {
    download.mockResolvedValue(42);
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/zip' });

    const id = await downloadBlob(blob, 'report.zip');

    expect(id).toBe(42);
    expect(download).toHaveBeenCalledTimes(1);
    const arg = download.mock.calls[0]?.[0] as {
      url?: string;
      filename?: string;
      saveAs?: boolean;
    };
    expect(arg.filename).toBe('report.zip');
    expect(arg.saveAs).toBe(false);
    expect(arg.url?.startsWith('data:application/zip;base64,')).toBe(true);
  });
});
