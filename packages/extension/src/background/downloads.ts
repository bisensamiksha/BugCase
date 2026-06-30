import { type Downloads } from 'webextension-polyfill';

import { blobToDataUrl } from '../lib/blob-data-url';
import browser from '../lib/browser';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Compact UTC timestamp `YYYYMMDD-HHmmss` — stable regardless of the runner's timezone. */
function utcStamp(now: Date): string {
  return (
    String(now.getUTCFullYear()) +
    pad2(now.getUTCMonth() + 1) +
    pad2(now.getUTCDate()) +
    '-' +
    pad2(now.getUTCHours()) +
    pad2(now.getUTCMinutes()) +
    pad2(now.getUTCSeconds())
  );
}

/** Slug of the page host for the filename; `capture` when the origin is missing/unparseable. */
function hostSlug(origin?: string): string {
  if (origin) {
    try {
      const slug = new URL(origin).hostname
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
      if (slug) {
        return slug;
      }
    } catch {
      // fall through to the default below
    }
  }
  return 'capture';
}

/** `bugcase-<host>-<YYYYMMDD-HHmmss>.zip`, e.g. `bugcase-example-com-20260613-090807.zip`. */
export function buildCaptureReportFilename(now: Date, origin?: string): string {
  return `bugcase-${hostSlug(origin)}-${utcStamp(now)}.zip`;
}

/** Object-URL helpers, injectable so the data-URL vs blob-URL branch is unit-testable. */
export interface ObjectUrlApi {
  readonly create: (blob: Blob) => string;
  readonly revoke: (url: string) => void;
}

/**
 * The platform's object-URL API, or `null` when unavailable. Firefox's MV3 background is an event
 * page, so `URL.createObjectURL` exists; Chrome's MV3 service worker has no `URL.createObjectURL`
 * and returns `null` here, so callers fall back to a `data:` URL.
 */
function platformObjectUrlApi(): ObjectUrlApi | null {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    return {
      create: (blob) => URL.createObjectURL(blob),
      revoke: (url) => {
        URL.revokeObjectURL(url);
      },
    };
  }
  return null;
}

/** Revoke the object URL once the download reaches a terminal state, so the blob can be freed. */
function revokeWhenSettled(downloadId: number, revoke: () => void): void {
  const onChanged = browser.downloads.onChanged;
  if (!onChanged) {
    revoke();
    return;
  }
  const listener = (delta: Downloads.OnChangedDownloadDeltaType): void => {
    if (delta.id !== downloadId) {
      return;
    }
    const state = delta.state?.current;
    if (state === 'complete' || state === 'interrupted') {
      onChanged.removeListener(listener);
      revoke();
    }
  };
  onChanged.addListener(listener);
}

/**
 * Download a Blob via `chrome.downloads`.
 *
 * Firefox rejects `data:` URLs ("Access denied for URL data:…") but accepts `blob:` object URLs, and
 * its event-page background exposes `URL.createObjectURL` — so use an object URL there and revoke it
 * once the download settles. Chrome's MV3 service worker has no `URL.createObjectURL`, so fall back
 * to a base64 `data:` URL. Returns the download id; rejections (e.g. missing `downloads` permission)
 * are the caller's to handle. `objectUrl` is injectable for tests.
 */
export async function downloadBlob(
  blob: Blob,
  filename: string,
  objectUrl: ObjectUrlApi | null = platformObjectUrlApi(),
): Promise<number> {
  if (objectUrl) {
    const url = objectUrl.create(blob);
    try {
      const downloadId = await browser.downloads.download({ url, filename, saveAs: false });
      revokeWhenSettled(downloadId, () => {
        objectUrl.revoke(url);
      });
      return downloadId;
    } catch (error) {
      objectUrl.revoke(url);
      throw error;
    }
  }
  const url = await blobToDataUrl(blob);
  return browser.downloads.download({ url, filename, saveAs: false });
}
