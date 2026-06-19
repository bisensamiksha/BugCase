// MAIN-world network capture (S2-07).
//
// Runs in the page's own JS world (installed from injected/main-entry.ts at document_start) so it can
// wrap the page's real `fetch` and `XMLHttpRequest`. Every request is recorded into a fixed-size FIFO
// ring buffer as lightweight metadata — URL, method, status, headers, and timing — and **never the
// request or response body** on this passive path (bodies require the on-demand `chrome.debugger`
// attach in S2-10). The isolated content script pulls the buffer across the bridge (S2-05) on capture.
//
// The wrappers always forward to the originals and re-throw rejections, so page behavior is unchanged;
// capture failures are swallowed so they can never break a page's networking.

import {
  normalizeHeaders,
  parseHeaderString,
  type NetworkBufferEntry,
} from '../shared/network-entry';
import { RingBuffer } from '../shared/ring-buffer';

/** Default cap on retained entries — matches the console buffer's 500-entry FIFO. */
export const DEFAULT_NETWORK_BUFFER_SIZE = 500;

/**
 * The slice of a window the buffer needs: `fetch` and the `XMLHttpRequest` constructor. Both optional
 * so a host missing either (or a fake in tests) is handled. The real `window` satisfies it.
 */
export interface NetworkCaptureScope {
  fetch?: typeof globalThis.fetch;
  XMLHttpRequest?: typeof globalThis.XMLHttpRequest;
}

export interface NetworkRingBufferOptions {
  /** Max entries retained before the oldest are evicted. Defaults to {@link DEFAULT_NETWORK_BUFFER_SIZE}. */
  readonly maxSize?: number;
  /** Clock injection for deterministic tests; defaults to `Date.now`. */
  readonly now?: () => number;
}

export interface NetworkRingBufferHandle {
  /** Defensive copy of the buffered entries, oldest → newest. */
  snapshot(): readonly NetworkBufferEntry[];
  /** Restore the original `fetch` / `XMLHttpRequest` methods. */
  uninstall(): void;
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url; // Request
}

function resolveMethod(input: RequestInfo | URL, init?: RequestInit): string {
  const fromInput = typeof input !== 'string' && !(input instanceof URL) ? input.method : undefined;
  return (init?.method ?? fromInput ?? 'GET').toUpperCase();
}

function requestHeadersOf(input: RequestInfo | URL, init?: RequestInit): unknown {
  if (init?.headers !== undefined) {
    return init.headers;
  }
  if (typeof input === 'string' || input instanceof URL) {
    return undefined;
  }
  return input.headers;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Patch `scope.fetch`, recording metadata on settle and forwarding the original response/rejection. */
function patchFetch(
  scope: NetworkCaptureScope,
  originalFetch: typeof globalThis.fetch,
  buffer: RingBuffer<NetworkBufferEntry>,
  now: () => number,
  restorers: Array<() => void>,
): void {
  const patched = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const startedAt = now();
    const url = resolveUrl(input);
    const method = resolveMethod(input, init);
    const requestHeaders = normalizeHeaders(requestHeadersOf(input, init));

    return originalFetch(input, init).then(
      (response) => {
        const endedAt = now();
        buffer.push({
          initiator: 'fetch',
          url,
          method,
          status: response.status,
          statusText: response.statusText || null,
          requestHeaders,
          responseHeaders: normalizeHeaders(response.headers),
          startedAt,
          endedAt,
          durationMs: endedAt - startedAt,
          failed: false,
          errorText: null,
        });
        return response;
      },
      (error: unknown) => {
        const endedAt = now();
        buffer.push({
          initiator: 'fetch',
          url,
          method,
          status: null,
          statusText: null,
          requestHeaders,
          responseHeaders: [],
          startedAt,
          endedAt,
          durationMs: endedAt - startedAt,
          failed: true,
          errorText: errorText(error),
        });
        throw error; // never swallow the page's rejection
      },
    );
  };

  scope.fetch = patched;
  restorers.push(() => {
    if (scope.fetch === patched) {
      scope.fetch = originalFetch;
    }
  });
}

interface XhrMeta {
  method: string;
  url: string;
  requestHeaders: Array<{ name: string; value: string }>;
  startedAt: number;
}

/** Patch the `XMLHttpRequest` prototype, recording metadata on `loadend` and forwarding all calls. */
function patchXhr(
  XhrCtor: typeof globalThis.XMLHttpRequest,
  buffer: RingBuffer<NetworkBufferEntry>,
  now: () => number,
  restorers: Array<() => void>,
): void {
  const proto = XhrCtor.prototype;
  const meta = new WeakMap<XMLHttpRequest, XhrMeta>();
  /* eslint-disable @typescript-eslint/unbound-method --
     Capturing the prototype originals so the patched methods can forward to them with an explicit
     `.call`/`.apply(this, …)`; the unbound reference is intentional, not an accidental this-loss. */
  const origOpen = proto.open;
  const origSend = proto.send;
  const origSetRequestHeader = proto.setRequestHeader;
  /* eslint-enable @typescript-eslint/unbound-method */

  proto.open = function patchedOpen(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ): void {
    meta.set(this, {
      method: method.toUpperCase(),
      url: String(url),
      requestHeaders: [],
      startedAt: 0,
    });
    (origOpen as (...args: unknown[]) => void).apply(this, [method, url, ...rest]);
  };

  proto.setRequestHeader = function patchedSetRequestHeader(
    this: XMLHttpRequest,
    name: string,
    value: string,
  ): void {
    meta.get(this)?.requestHeaders.push({ name, value });
    origSetRequestHeader.call(this, name, value);
  };

  proto.send = function patchedSend(
    this: XMLHttpRequest,
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const entryMeta = meta.get(this);
    if (entryMeta) {
      entryMeta.startedAt = now();
      // Arrow listener captures `this` (the XHR) lexically, so no aliasing is needed.
      this.addEventListener('loadend', () => {
        const failed = this.status === 0; // network error / abort leaves status at 0
        const endedAt = now();
        buffer.push({
          initiator: 'xhr',
          url: entryMeta.url,
          method: entryMeta.method,
          status: failed ? null : this.status,
          statusText: failed ? null : this.statusText || null,
          requestHeaders: entryMeta.requestHeaders,
          responseHeaders: parseHeaderString(this.getAllResponseHeaders()),
          startedAt: entryMeta.startedAt,
          endedAt,
          durationMs: endedAt - entryMeta.startedAt,
          failed,
          errorText: failed ? 'Network request failed' : null,
        });
      });
    }
    origSend.call(this, body); // body is forwarded, never captured
  };

  restorers.push(() => {
    proto.open = origOpen;
    proto.send = origSend;
    proto.setRequestHeader = origSetRequestHeader;
  });
}

/**
 * Wrap `fetch` and `XMLHttpRequest` on `scope` so every request's metadata lands in a bounded FIFO
 * buffer. Bodies are never captured. Originals are always forwarded (and rejections re-thrown), so
 * page behavior is unchanged. Returns a handle to read the buffer or tear the wrappers down.
 */
export function installNetworkRingBuffer(
  scope: NetworkCaptureScope,
  options: NetworkRingBufferOptions = {},
): NetworkRingBufferHandle {
  const maxSize = options.maxSize ?? DEFAULT_NETWORK_BUFFER_SIZE;
  const now = options.now ?? Date.now;
  const buffer = new RingBuffer<NetworkBufferEntry>(maxSize);
  const restorers: Array<() => void> = [];

  if (typeof scope.fetch === 'function') {
    patchFetch(scope, scope.fetch, buffer, now, restorers);
  }
  if (typeof scope.XMLHttpRequest === 'function') {
    patchXhr(scope.XMLHttpRequest, buffer, now, restorers);
  }

  return {
    snapshot: () => buffer.snapshot(),
    uninstall() {
      while (restorers.length > 0) {
        restorers.pop()?.();
      }
      buffer.clear();
    },
  };
}
