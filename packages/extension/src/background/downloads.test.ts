import { beforeEach, describe, expect, it, vi } from 'vitest';

const { download, addListener, removeListener } = vi.hoisted(() => ({
  download: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
}));
vi.mock('webextension-polyfill', () => ({
  default: { downloads: { download, onChanged: { addListener, removeListener } } },
}));

import { buildCaptureReportFilename, downloadBlob, type ObjectUrlApi } from './downloads';

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

function fakeObjectUrl(): ObjectUrlApi & {
  create: ReturnType<typeof vi.fn>;
  revoke: ReturnType<typeof vi.fn>;
} {
  return {
    create: vi.fn((_blob: Blob) => 'blob:fake-object-url'),
    revoke: vi.fn(),
  };
}

describe('downloadBlob', () => {
  beforeEach(() => {
    download.mockReset();
    addListener.mockReset();
    removeListener.mockReset();
  });

  it('falls back to a base64 data URL when object URLs are unavailable (Chrome MV3 worker)', async () => {
    download.mockResolvedValue(42);
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/zip' });

    // null = no URL.createObjectURL (the Chrome service-worker case).
    const id = await downloadBlob(blob, 'report.zip', null);

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

  it('uses a blob: object URL when available (Firefox rejects data: URLs)', async () => {
    download.mockResolvedValue(7);
    const objectUrl = fakeObjectUrl();
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/zip' });

    const id = await downloadBlob(blob, 'report.zip', objectUrl);

    expect(id).toBe(7);
    expect(objectUrl.create).toHaveBeenCalledWith(blob);
    const arg = download.mock.calls[0]?.[0] as { url?: string };
    expect(arg.url).toBe('blob:fake-object-url');
    // Not yet revoked — that waits for the download to settle.
    expect(objectUrl.revoke).not.toHaveBeenCalled();
    expect(addListener).toHaveBeenCalledTimes(1);
  });

  it('revokes the object URL once the download completes', async () => {
    download.mockResolvedValue(7);
    const objectUrl = fakeObjectUrl();

    await downloadBlob(new Blob([new Uint8Array([1])]), 'r.zip', objectUrl);

    const listener = addListener.mock.calls[0]?.[0] as (delta: unknown) => void;
    // A delta for a different download must not revoke.
    listener({ id: 99, state: { current: 'complete' } });
    expect(objectUrl.revoke).not.toHaveBeenCalled();
    // The matching download completing revokes the URL and detaches the listener.
    listener({ id: 7, state: { current: 'complete' } });
    expect(objectUrl.revoke).toHaveBeenCalledWith('blob:fake-object-url');
    expect(removeListener).toHaveBeenCalledTimes(1);
  });

  it('revokes the object URL and rethrows if the download call fails', async () => {
    download.mockRejectedValue(new Error('downloads denied'));
    const objectUrl = fakeObjectUrl();

    await expect(downloadBlob(new Blob([new Uint8Array([1])]), 'r.zip', objectUrl)).rejects.toThrow(
      'downloads denied',
    );
    expect(objectUrl.revoke).toHaveBeenCalledWith('blob:fake-object-url');
  });
});
