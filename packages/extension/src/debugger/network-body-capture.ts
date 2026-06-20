/**
 * CDP response-body collector (S2-10).
 *
 * Subscribes to `Network.responseReceived`/`Network.loadingFinished` on an attached
 * {@link DebuggerSession}, drains events for a short window, then fetches the response body of each
 * finished request via `Network.getResponseBody`. Bodies are capped to `maxBodyBytes` (the cap is a
 * still-open product decision — see `./config`) and any per-request failure is swallowed so a single
 * unreadable body never aborts the capture.
 */

import type { DebuggerSession } from './debugger-session';

/** A captured response body, sized and possibly truncated. Mirrors the schema's `NetworkBody`. */
export interface CapturedResponseBody {
  readonly requestId: string;
  readonly url: string;
  readonly mimeType: string | null;
  /** Original (pre-truncation) body size in bytes. */
  readonly sizeBytes: number;
  readonly base64?: string;
  readonly text?: string;
  readonly truncated: boolean;
}

export interface NetworkBodyCaptureOptions {
  /** Max retained bytes per body; larger bodies are truncated (see `./config`). */
  readonly maxBodyBytes: number;
  /** Time to drain CDP events before fetching bodies. */
  readonly drainMs: number;
}

export interface NetworkBodyCaptureDeps {
  /** Defaults to a real timer; injected in tests for determinism. */
  readonly wait?: (ms: number) => Promise<void>;
}

interface ResponseMeta {
  readonly url: string;
  readonly mimeType: string | null;
}

interface GetResponseBodyResult {
  readonly body: string;
  readonly base64Encoded: boolean;
}

const defaultWait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Build a {@link CapturedResponseBody}, capping `text`/`base64` payloads to `maxBodyBytes`. */
function toCapturedBody(
  requestId: string,
  meta: ResponseMeta,
  result: GetResponseBodyResult,
  maxBodyBytes: number,
): CapturedResponseBody {
  const base = { requestId, url: meta.url, mimeType: meta.mimeType };
  if (result.base64Encoded) {
    const binary = atob(result.body);
    const sizeBytes = binary.length;
    if (sizeBytes <= maxBodyBytes) {
      return { ...base, sizeBytes, base64: result.body, truncated: false };
    }
    return { ...base, sizeBytes, base64: btoa(binary.slice(0, maxBodyBytes)), truncated: true };
  }
  const sizeBytes = byteLength(result.body);
  if (sizeBytes <= maxBodyBytes) {
    return { ...base, sizeBytes, text: result.body, truncated: false };
  }
  return { ...base, sizeBytes, text: result.body.slice(0, maxBodyBytes), truncated: true };
}

/**
 * Collect response bodies for requests that complete during the drain window. Returns bodies in the
 * order their requests finished. Never throws: requests without a recorded response, or whose body
 * cannot be fetched, are skipped.
 */
export async function captureNetworkBodies(
  session: DebuggerSession,
  options: NetworkBodyCaptureOptions,
  deps: NetworkBodyCaptureDeps = {},
): Promise<CapturedResponseBody[]> {
  const meta = new Map<string, ResponseMeta>();
  const finished: string[] = [];
  const seenFinished = new Set<string>();

  const offResponse = session.on('Network.responseReceived', (params) => {
    const p = params as { requestId?: string; response?: { url?: string; mimeType?: string } };
    if (typeof p.requestId === 'string' && typeof p.response?.url === 'string') {
      meta.set(p.requestId, { url: p.response.url, mimeType: p.response.mimeType ?? null });
    }
  });
  const offFinished = session.on('Network.loadingFinished', (params) => {
    const requestId = (params as { requestId?: string }).requestId;
    if (typeof requestId === 'string' && !seenFinished.has(requestId)) {
      seenFinished.add(requestId);
      finished.push(requestId);
    }
  });

  try {
    await (deps.wait ?? defaultWait)(options.drainMs);

    const bodies: CapturedResponseBody[] = [];
    for (const requestId of finished) {
      const requestMeta = meta.get(requestId);
      if (!requestMeta) {
        continue;
      }
      try {
        const result = (await session.sendCommand('Network.getResponseBody', {
          requestId,
        })) as GetResponseBodyResult;
        bodies.push(toCapturedBody(requestId, requestMeta, result, options.maxBodyBytes));
      } catch {
        // Body may be evicted or non-retrievable (redirects, opaque responses) — skip it.
      }
    }
    return bodies;
  } finally {
    offResponse();
    offFinished();
  }
}
