import { blobToDataUrl } from '../lib/blob-data-url';

import type { PeekReportAssetRequest, PeekReportAssetResponse } from './messages';
import type { HeldReport } from './report-hold';

export interface ReportAssetHandlerDeps {
  /** Non-consuming lookup of the held report; typically `reportHold.peek`. */
  readonly peek: (reportId: string) => HeldReport | undefined;
  /** Encodes an asset value as a data URL; defaults to a Blob-normalizing `blobToDataUrl`. */
  readonly toDataUrl?: (data: Blob | string | Uint8Array) => Promise<string>;
}

/** Normalize any held asset value to a Blob, then to a data URL. Screenshots are already Blobs. */
function defaultToDataUrl(data: Blob | string | Uint8Array): Promise<string> {
  if (data instanceof Blob) {
    return blobToDataUrl(data);
  }
  if (typeof data === 'string') {
    return blobToDataUrl(new Blob([data], { type: 'text/plain' }));
  }
  // Copy into a fresh ArrayBuffer-backed view so it is a valid BlobPart (not SharedArrayBuffer).
  return blobToDataUrl(new Blob([new Uint8Array(data)], { type: 'application/octet-stream' }));
}

/**
 * Read a single held asset (by canonical ZIP path) and return it as a data URL, without consuming
 * the hold. `expired` when the hold is gone (SW eviction); `not-found` when the path is absent.
 * Never throws — any conversion error resolves to a handled failure.
 */
export async function handlePeekReportAsset(
  message: PeekReportAssetRequest,
  deps: ReportAssetHandlerDeps,
): Promise<PeekReportAssetResponse> {
  const held = deps.peek(message.reportId);
  if (!held) {
    return { ok: false, reason: 'expired' };
  }
  const data = held.assets.files.get(message.path);
  if (data === undefined) {
    return { ok: false, reason: 'not-found' };
  }
  try {
    const dataUrl = await (deps.toDataUrl ?? defaultToDataUrl)(data);
    return { ok: true, dataUrl };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
