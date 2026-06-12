import { beforeEach, describe, expect, it, vi } from 'vitest';

const { captureVisibleTab } = vi.hoisted(() => ({ captureVisibleTab: vi.fn() }));
vi.mock('webextension-polyfill', () => ({
  default: { tabs: { captureVisibleTab } },
}));

import { captureVisibleViewport, dataUrlToBlob, readPngDimensions } from './capture-visible-tab';

/** Build the first 24 bytes of a PNG (signature + IHDR width/height) — enough to measure. */
function fakePng(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13); // IHDR length
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function pngDataUrl(width: number, height: number): string {
  return `data:image/png;base64,${toBase64(fakePng(width, height))}`;
}

describe('readPngDimensions', () => {
  it('reads width/height from the PNG IHDR header', () => {
    expect(readPngDimensions(fakePng(1920, 1080))).toEqual({ width: 1920, height: 1080 });
  });

  it('throws on bytes that are not a PNG', () => {
    expect(() => readPngDimensions(new Uint8Array([1, 2, 3]))).toThrow(/PNG/i);
  });
});

describe('dataUrlToBlob', () => {
  it('converts a base64 PNG data URL to a Blob with the right type and bytes', async () => {
    const png = fakePng(2, 2);
    const blob = dataUrlToBlob(`data:image/png;base64,${toBase64(png)}`);
    expect(blob.type).toBe('image/png');
    const out = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(out)).toEqual(Array.from(png));
  });

  it('throws on a malformed data URL', () => {
    expect(() => dataUrlToBlob('not-a-data-url')).toThrow(/data URL/i);
  });
});

describe('captureVisibleViewport', () => {
  beforeEach(() => {
    captureVisibleTab.mockReset();
  });

  it('captures, converts to a PNG Blob, and returns dimensions + method', async () => {
    captureVisibleTab.mockResolvedValue(pngDataUrl(1280, 800));
    const result = await captureVisibleViewport({ devicePixelRatio: 2 });
    expect(result.captureMethod).toBe('visibleTab');
    expect(result.width).toBe(1280);
    expect(result.height).toBe(800);
    expect(result.devicePixelRatio).toBe(2);
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.type).toBe('image/png');
  });

  it('passes windowId through when provided', async () => {
    captureVisibleTab.mockResolvedValue(pngDataUrl(10, 10));
    await captureVisibleViewport({ windowId: 42 });
    expect(captureVisibleTab).toHaveBeenCalledWith(42, { format: 'png' });
  });

  it('uses the current window (undefined windowId) when none is provided', async () => {
    captureVisibleTab.mockResolvedValue(pngDataUrl(10, 10));
    await captureVisibleViewport();
    expect(captureVisibleTab).toHaveBeenCalledWith(undefined, { format: 'png' });
  });

  it('defaults devicePixelRatio to 1 when unavailable', async () => {
    captureVisibleTab.mockResolvedValue(pngDataUrl(5, 5));
    expect((await captureVisibleViewport()).devicePixelRatio).toBe(1);
  });

  it('throws a clear error when capture returns empty (denied/empty state)', async () => {
    captureVisibleTab.mockResolvedValue('');
    await expect(captureVisibleViewport()).rejects.toThrow(/no image data/i);
  });

  it('propagates a permission-denied rejection', async () => {
    captureVisibleTab.mockRejectedValue(new Error('activeTab not granted'));
    await expect(captureVisibleViewport()).rejects.toThrow(/activeTab/);
  });
});
