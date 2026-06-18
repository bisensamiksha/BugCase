/**
 * Passive network-capture entry shape + header mappers (S2-07).
 *
 * The network ring buffer records request *metadata* only — URL, method, status, headers, and
 * timing — and deliberately never request/response bodies on this passive path (bodies require the
 * on-demand `chrome.debugger` attach in S2-08). The field names mirror the report schema's
 * `NetworkEntry` (minus `id`, bodies, and the debugger-only flags) so S2-24 can map a buffered entry
 * to a `NetworkEntry` without renaming. Header scrubbing (Authorization/Cookie, etc.) is applied
 * later by the report pipeline (S2-13), not here.
 */

export type NetworkInitiator = 'fetch' | 'xhr';

export interface NetworkHeader {
  readonly name: string;
  readonly value: string;
}

export interface NetworkBufferEntry {
  readonly initiator: NetworkInitiator;
  readonly url: string;
  readonly method: string;
  /** HTTP status, or `null` when the request failed before any response. */
  readonly status: number | null;
  readonly statusText: string | null;
  readonly requestHeaders: readonly NetworkHeader[];
  readonly responseHeaders: readonly NetworkHeader[];
  /** Epoch ms at request start. */
  readonly startedAt: number;
  /** Epoch ms when the request settled (resolved or rejected), or `null` if never observed. */
  readonly endedAt: number | null;
  readonly durationMs: number | null;
  readonly failed: boolean;
  readonly errorText: string | null;
}

/** Whether a value looks like a WHATWG `Headers` (or anything iterable via `forEach(value, name)`). */
function isHeadersLike(
  value: object,
): value is { forEach(cb: (value: string, name: string) => void): void } {
  return typeof (value as { forEach?: unknown }).forEach === 'function';
}

/**
 * Normalize the many shapes request/response headers arrive in — a `Headers` instance, an array of
 * `[name, value]` pairs, or a plain record — into a flat `NetworkHeader[]`. Unknown inputs (null,
 * primitives) yield an empty array so callers never have to guard.
 */
export function normalizeHeaders(source: unknown): NetworkHeader[] {
  if (source === null || typeof source !== 'object') {
    return [];
  }
  const out: NetworkHeader[] = [];
  if (Array.isArray(source)) {
    for (const pair of source) {
      if (Array.isArray(pair) && pair.length >= 2) {
        out.push({ name: String(pair[0]), value: String(pair[1]) });
      }
    }
    return out;
  }
  if (isHeadersLike(source)) {
    source.forEach((value, name) => out.push({ name, value: String(value) }));
    return out;
  }
  for (const [name, value] of Object.entries(source as Record<string, unknown>)) {
    out.push({ name, value: String(value) });
  }
  return out;
}

/**
 * Parse the CRLF-separated string returned by `XMLHttpRequest.getAllResponseHeaders()` into a flat
 * `NetworkHeader[]`. Only the first colon splits name from value, so colons inside the value survive.
 */
export function parseHeaderString(raw: string): NetworkHeader[] {
  const out: NetworkHeader[] = [];
  for (const line of raw.split(/[\r\n]+/)) {
    const trimmed = line.trim();
    if (trimmed === '') {
      continue;
    }
    const idx = trimmed.indexOf(':');
    if (idx === -1) {
      continue;
    }
    out.push({ name: trimmed.slice(0, idx).trim(), value: trimmed.slice(idx + 1).trim() });
  }
  return out;
}
