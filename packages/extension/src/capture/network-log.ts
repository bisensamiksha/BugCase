/**
 * Network ring-buffer → schema `NetworkLog` mapper (S2-25).
 *
 * Turns the raw metadata entries the S2-07 network ring buffer flushes across the bridge into the
 * report schema's `NetworkLog`. Request/response headers are scrubbed here via the S2-09 header rule
 * (`scrubHeaders`) before they enter the report — the buffer stores them raw by design. Pure and
 * defensive: malformed `unknown[]` entries are skipped. Bodies are never present on this passive
 * path, so `request`/`response` are always `null`.
 */

import {
  aggregateScrubberHits,
  scrubHeaders,
  type NetworkEntry,
  type NetworkLog,
  type ScrubberRuleApplied,
} from '@bugcase/schema';

import type { NetworkBufferEntry } from '../shared/network-entry';

function defaultNewId(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return cryptoApi?.randomUUID ? cryptoApi.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function isoOrNull(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString();
}

/** Narrow an `unknown` bridge entry to a usable `NetworkBufferEntry`, or `null` if malformed. */
function coerce(value: unknown): NetworkBufferEntry | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const candidate = value as Partial<NetworkBufferEntry>;
  if (
    typeof candidate.url !== 'string' ||
    typeof candidate.method !== 'string' ||
    typeof candidate.startedAt !== 'number' ||
    !Array.isArray(candidate.requestHeaders) ||
    !Array.isArray(candidate.responseHeaders)
  ) {
    return null;
  }
  return candidate as NetworkBufferEntry;
}

function toEntry(
  raw: NetworkBufferEntry,
  newId: () => string,
): { entry: NetworkEntry; applied: readonly ScrubberRuleApplied[] } {
  const req = scrubHeaders(raw.requestHeaders);
  const res = scrubHeaders(raw.responseHeaders);
  const entry: NetworkEntry = {
    id: newId(),
    url: raw.url,
    method: raw.method,
    status: raw.status,
    statusText: raw.statusText,
    initiator: raw.initiator,
    startedAt: new Date(raw.startedAt).toISOString(),
    endedAt: isoOrNull(raw.endedAt),
    durationMs: raw.durationMs,
    requestHeaders: req.value,
    responseHeaders: res.value,
    request: null,
    response: null,
    fromCache: false,
    failed: raw.failed,
    errorText: raw.errorText,
  };
  return { entry, applied: [...req.applied, ...res.applied] };
}

export interface ToNetworkLogResult {
  readonly log: NetworkLog;
  /** Header scrubber hits, aggregated by rule id, to merge into `metadata.scrubbersApplied`. */
  readonly scrubbersApplied: readonly ScrubberRuleApplied[];
}

export interface ToNetworkLogOptions {
  /** Id generator (injectable for tests); defaults to `crypto.randomUUID`. */
  readonly newId?: () => string;
}

/** Map raw bridge `network` entries to a schema `NetworkLog`, scrubbing headers via S2-09. */
export function toNetworkLog(
  entries: readonly unknown[],
  options: ToNetworkLogOptions = {},
): ToNetworkLogResult {
  const newId = options.newId ?? defaultNewId;
  const allApplied: ScrubberRuleApplied[] = [];
  const mapped = entries.flatMap((value) => {
    const raw = coerce(value);
    if (!raw) {
      return [];
    }
    const { entry, applied } = toEntry(raw, newId);
    allApplied.push(...applied);
    return [entry];
  });
  return {
    log: {
      schemaVersion: 'v1',
      capturedFromRingBuffer: true,
      capturedFromDebugger: false,
      entries: mapped,
    },
    scrubbersApplied: aggregateScrubberHits(allApplied),
  };
}
