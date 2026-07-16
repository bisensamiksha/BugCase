import type { NetworkEntry } from '@bugcase/schema';
import type { SearchMatcher } from '@bugcase/shared-ui';
import { describe, expect, it } from 'vitest';

import {
  distinctMethods,
  entryText,
  filterNetwork,
  initiatorCounts,
  methodCounts,
  networkTimeRange,
  presentInitiators,
  presentStatusClasses,
  statusClass,
  statusClassCounts,
} from './network-filters';

const entry = (over: Partial<NetworkEntry> = {}): NetworkEntry => ({
  id: 'n1',
  url: 'https://example.com/api',
  method: 'GET',
  status: 200,
  statusText: 'OK',
  initiator: 'fetch',
  startedAt: '2026-06-27T12:00:00.000Z',
  endedAt: '2026-06-27T12:00:00.120Z',
  durationMs: 120,
  requestHeaders: [],
  responseHeaders: [],
  request: null,
  response: null,
  fromCache: false,
  failed: false,
  errorText: null,
  ...over,
});

/** A substring matcher, standing in for a compiled search. */
const contains =
  (needle: string): SearchMatcher =>
  (text) =>
    text.toLowerCase().includes(needle.toLowerCase());

describe('statusClass', () => {
  it('buckets by hundreds digit', () => {
    expect(statusClass(entry({ status: 204 }))).toBe('2xx');
    expect(statusClass(entry({ status: 301 }))).toBe('3xx');
    expect(statusClass(entry({ status: 404 }))).toBe('4xx');
    expect(statusClass(entry({ status: 503 }))).toBe('5xx');
  });

  it('classifies failed and null-status entries as failed', () => {
    expect(statusClass(entry({ failed: true, status: null }))).toBe('failed');
    expect(statusClass(entry({ failed: false, status: null }))).toBe('failed');
    expect(statusClass(entry({ failed: true, status: 200 }))).toBe('failed');
  });
});

describe('networkTimeRange', () => {
  it('spans min startedAt to max ended time', () => {
    const range = networkTimeRange([
      entry({ startedAt: '2026-06-27T12:00:00.000Z', endedAt: '2026-06-27T12:00:00.500Z' }),
      entry({ startedAt: '2026-06-27T12:00:01.000Z', endedAt: '2026-06-27T12:00:02.000Z' }),
    ]);
    expect(range).toEqual({
      minMs: Date.parse('2026-06-27T12:00:00.000Z'),
      maxMs: Date.parse('2026-06-27T12:00:02.000Z'),
    });
  });

  it('falls back to startedAt when endedAt is null', () => {
    const range = networkTimeRange([entry({ endedAt: null, durationMs: null })]);
    const started = Date.parse('2026-06-27T12:00:00.000Z');
    expect(range).toEqual({ minMs: started, maxMs: started });
  });

  it('returns null for empty input', () => {
    expect(networkTimeRange([])).toBeNull();
  });
});

describe('entryText', () => {
  it('includes url, method, status, statusText, initiator and headers', () => {
    const text = entryText(
      entry({
        url: 'https://api.test/users',
        method: 'POST',
        status: 201,
        statusText: 'Created',
        initiator: 'xhr',
        requestHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        responseHeaders: [{ name: 'X-Trace', value: 'abc123' }],
      }),
    );
    expect(text).toContain('https://api.test/users');
    expect(text).toContain('POST');
    expect(text).toContain('201');
    expect(text).toContain('Created');
    expect(text).toContain('xhr');
    expect(text).toContain('Content-Type');
    expect(text).toContain('application/json');
    expect(text).toContain('X-Trace');
    expect(text).toContain('abc123');
  });
});

describe('present chip sets', () => {
  const entries = [
    entry({ id: 'a', status: 200, method: 'GET', initiator: 'fetch' }),
    entry({ id: 'b', status: 404, method: 'POST', initiator: 'xhr' }),
    entry({ id: 'c', failed: true, status: null, method: 'GET', initiator: 'fetch' }),
  ];

  it('orders status classes numerically with failed last', () => {
    expect(presentStatusClasses(entries)).toEqual(['2xx', '4xx', 'failed']);
  });

  it('lists distinct methods sorted', () => {
    expect(distinctMethods(entries)).toEqual(['GET', 'POST']);
  });

  it('lists present initiators in schema order', () => {
    expect(presentInitiators(entries)).toEqual(['fetch', 'xhr']);
  });

  it('counts each dimension', () => {
    expect(statusClassCounts(entries)).toEqual({ '2xx': 1, '4xx': 1, failed: 1 });
    expect(methodCounts(entries)).toEqual({ GET: 2, POST: 1 });
    expect(initiatorCounts(entries)).toEqual({ fetch: 2, xhr: 1 });
  });
});

describe('filterNetwork', () => {
  const entries = [
    entry({ id: 'a', status: 200, method: 'GET', initiator: 'fetch', url: 'https://x/ok' }),
    entry({ id: 'b', status: 500, method: 'POST', initiator: 'xhr', url: 'https://x/boom' }),
    entry({
      id: 'c',
      failed: true,
      status: null,
      method: 'GET',
      initiator: 'fetch',
      url: 'https://x/dead',
    }),
  ];
  const all = {
    statusClasses: new Set(['2xx', '5xx', 'failed']),
    methods: new Set(['GET', 'POST']),
    initiators: new Set(['fetch', 'xhr'] as const),
    matcher: null as SearchMatcher | null,
  };

  it('keeps everything when all chips are on and no search', () => {
    expect(filterNetwork(entries, all).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('drops a status class when its chip is off', () => {
    const out = filterNetwork(entries, { ...all, statusClasses: new Set(['2xx', '5xx']) });
    expect(out.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('drops a method when its chip is off', () => {
    const out = filterNetwork(entries, { ...all, methods: new Set(['POST']) });
    expect(out.map((e) => e.id)).toEqual(['b']);
  });

  it('drops an initiator when its chip is off', () => {
    const out = filterNetwork(entries, { ...all, initiators: new Set(['xhr'] as const) });
    expect(out.map((e) => e.id)).toEqual(['b']);
  });

  it('applies the search matcher across entry text', () => {
    const out = filterNetwork(entries, { ...all, matcher: contains('boom') });
    expect(out.map((e) => e.id)).toEqual(['b']);
  });

  it('returns nothing when a dimension set is empty', () => {
    expect(filterNetwork(entries, { ...all, methods: new Set() })).toHaveLength(0);
  });
});
