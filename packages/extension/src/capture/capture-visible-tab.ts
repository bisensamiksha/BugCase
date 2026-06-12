import { browser } from '../lib/browser';

/** A viewport screenshot plus the metadata a report needs to describe it. */
export interface VisibleTabCapture {
  readonly blob: Blob;
  /** The original PNG data URL (handy for serializable messaging; see background/messages.ts). */
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
  readonly devicePixelRatio: number;
  readonly captureMethod: 'visibleTab';
}

export interface CaptureVisibleViewportOptions {
  readonly windowId?: number | undefined;
  /** Falls back to `globalThis.devicePixelRatio`, then `1`, when omitted. */
  readonly devicePixelRatio?: number | undefined;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/** Decode a `data:` URL into a Blob. Pure; works in a service worker and in Node tests. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma === -1) {
    throw new Error('Invalid data URL');
  }
  const header = dataUrl.slice(5, comma); // e.g. "image/png;base64"
  const payload = dataUrl.slice(comma + 1);
  const isBase64 = header.endsWith(';base64');
  const mime =
    (isBase64 ? header.slice(0, -';base64'.length) : header) || 'application/octet-stream';

  const binary = isBase64 ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

/** Read pixel dimensions straight from a PNG's IHDR header — no image decoder needed. */
export function readPngDimensions(bytes: Uint8Array): {
  readonly width: number;
  readonly height: number;
} {
  const signatureOk = bytes.length >= 24 && PNG_SIGNATURE.every((byte, i) => bytes[i] === byte);
  if (!signatureOk) {
    throw new Error('Not a valid PNG image');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * Promise wrapper around `tabs.captureVisibleTab`: captures the visible viewport as
 * a PNG, converts it to a Blob, and measures it. Throws a clear error if the browser
 * returns no image data (e.g. permission denied or an uncapturable tab); the rejection
 * is the caller's to handle.
 */
export async function captureVisibleViewport(
  options: CaptureVisibleViewportOptions = {},
): Promise<VisibleTabCapture> {
  // `windowId` is an optional positional arg (undefined → current window); options go second.
  const dataUrl = await browser.tabs.captureVisibleTab(options.windowId, { format: 'png' });

  if (!dataUrl) {
    throw new Error('captureVisibleTab returned no image data');
  }

  const blob = dataUrlToBlob(dataUrl);
  const { width, height } = readPngDimensions(new Uint8Array(await blob.arrayBuffer()));
  const devicePixelRatio = options.devicePixelRatio ?? globalThis.devicePixelRatio ?? 1;

  return { blob, dataUrl, width, height, devicePixelRatio, captureMethod: 'visibleTab' };
}
