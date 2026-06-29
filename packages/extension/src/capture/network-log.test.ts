import { describe, expect, it } from 'vitest';

import type { NetworkBufferEntry } from '../shared/network-entry';

import { toNetworkLog } from './network-log';

function sequentialIds(): () => string {
  let n = 0;
  return () => `id-${(n += 1)}`;
}

const SCRUBBED = '[scrubbed]';

const entry = (overrides: Partial<NetworkBufferEntry> = {}): NetworkBufferEntry => ({
  initiator: 'fetch',
  url: 'https://example.com/api',
  method: 'GET',
  status: 200,
  statusText: 'OK',
  requestHeaders: [{ name: 'Accept', value: 'application/json' }],
  responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
  startedAt: Date.parse('2026-06-27T12:00:00.000Z'),
  endedAt: Date.parse('2026-06-27T12:00:00.120Z'),
  durationMs: 120,
  failed: false,
  errorText: null,
  ...overrides,
});

describe('toNetworkLog', () => {
  it('maps a buffer entry to a schema NetworkEntry with ISO timestamps and no bodies', () => {
    const { log } = toNetworkLog([entry()], { newId: sequentialIds() });

    expect(log.schemaVersion).toBe('v1');
    expect(log.capturedFromRingBuffer).toBe(true);
    expect(log.capturedFromDebugger).toBe(false);
    const e = log.entries[0];
    expect(e?.id).toBe('id-1');
    expect(e?.url).toBe('https://example.com/api');
    expect(e?.method).toBe('GET');
    expect(e?.status).toBe(200);
    expect(e?.initiator).toBe('fetch');
    expect(e?.startedAt).toBe('2026-06-27T12:00:00.000Z');
    expect(e?.endedAt).toBe('2026-06-27T12:00:00.120Z');
    expect(e?.durationMs).toBe(120);
    expect(e?.request).toBeNull();
    expect(e?.response).toBeNull();
    expect(e?.fromCache).toBe(false);
  });

  it('scrubs sensitive headers and aggregates the scrubber hits by rule id', () => {
    const { log, scrubbersApplied } = toNetworkLog(
      [
        entry({
          requestHeaders: [
            { name: 'Authorization', value: 'Bearer secret-token' },
            { name: 'Accept', value: '*/*' },
          ],
          responseHeaders: [{ name: 'Set-Cookie', value: 'sid=abc; HttpOnly' }],
        }),
      ],
      { newId: sequentialIds() },
    );

    const e = log.entries[0];
    expect(e?.requestHeaders).toContainEqual({ name: 'Authorization', value: SCRUBBED });
    expect(e?.requestHeaders).toContainEqual({ name: 'Accept', value: '*/*' });
    expect(e?.responseHeaders).toContainEqual({ name: 'Set-Cookie', value: SCRUBBED });

    // Two masked headers across request + response → a single aggregated applied entry, hits 2.
    expect(scrubbersApplied).toHaveLength(1);
    expect(scrubbersApplied[0]?.id).toBe('header-secret-mask');
    expect(scrubbersApplied[0]?.hits).toBe(2);
  });

  it('maps a failed request with null status/duration without throwing', () => {
    const { log } = toNetworkLog(
      [
        entry({
          method: 'POST',
          status: null,
          statusText: null,
          endedAt: null,
          durationMs: null,
          failed: true,
          errorText: 'net::ERR_FAILED',
        }),
      ],
      { newId: sequentialIds() },
    );
    const e = log.entries[0];
    expect(e?.failed).toBe(true);
    expect(e?.status).toBeNull();
    expect(e?.endedAt).toBeNull();
    expect(e?.durationMs).toBeNull();
    expect(e?.errorText).toBe('net::ERR_FAILED');
  });

  it('returns an empty log and no applied rules for no entries', () => {
    const { log, scrubbersApplied } = toNetworkLog([]);
    expect(log.entries).toEqual([]);
    expect(scrubbersApplied).toEqual([]);
  });

  it('skips malformed entries without throwing', () => {
    const { log } = toNetworkLog([null, 7, { url: 123 }, entry({ url: 'https://ok.test/' })], {
      newId: sequentialIds(),
    });
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]?.url).toBe('https://ok.test/');
  });
});
