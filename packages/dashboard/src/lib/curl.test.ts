import type { NetworkBody, NetworkEntry } from '@bugcase/schema';
import { describe, expect, it } from 'vitest';

import { toCurl } from './curl';

const body = (over: Partial<NetworkBody> = {}): NetworkBody => ({
  mimeType: 'application/json',
  sizeBytes: 7,
  text: '{"a":1}',
  truncated: false,
  ...over,
});

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

describe('toCurl', () => {
  it('builds a bare GET with just the quoted url', () => {
    expect(toCurl(entry({ method: 'GET', url: 'https://x/ok' }))).toBe("curl 'https://x/ok'");
  });

  it('adds -X for a non-GET method', () => {
    expect(toCurl(entry({ method: 'POST', url: 'https://x/save' }))).toContain('-X POST');
  });

  it('emits one -H per request header', () => {
    const cmd = toCurl(
      entry({
        requestHeaders: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Accept', value: '*/*' },
        ],
      }),
    );
    expect(cmd).toContain("-H 'Content-Type: application/json'");
    expect(cmd).toContain("-H 'Accept: */*'");
  });

  it('includes a text request body as --data-raw', () => {
    const cmd = toCurl(entry({ method: 'POST', request: body({ text: '{"a":1}' }) }));
    expect(cmd).toContain('--data-raw \'{"a":1}\'');
  });

  it('omits the body when the request has no text (e.g. binary only)', () => {
    const cmd = toCurl(
      entry({
        method: 'POST',
        request: {
          mimeType: 'application/octet-stream',
          sizeBytes: 3,
          base64: 'AAA=',
          truncated: false,
        },
      }),
    );
    expect(cmd).not.toContain('--data-raw');
  });

  it('escapes single quotes POSIX-safely', () => {
    const cmd = toCurl(
      entry({ url: 'https://x/a', requestHeaders: [{ name: 'X-Note', value: "O'Brien" }] }),
    );
    expect(cmd).toContain("-H 'X-Note: O'\\''Brien'");
  });
});
