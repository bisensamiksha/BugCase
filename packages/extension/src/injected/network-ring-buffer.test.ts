import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_NETWORK_BUFFER_SIZE,
  installNetworkRingBuffer,
  type NetworkCaptureScope,
} from './network-ring-buffer';

/** A minimal fetch `Response` stand-in exposing only the metadata the buffer reads. */
function fakeResponse(init: {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
}) {
  const headers = init.headers ?? {};
  return {
    status: init.status ?? 200,
    statusText: init.statusText ?? '',
    headers: {
      forEach(cb: (value: string, name: string) => void) {
        for (const [name, value] of Object.entries(headers)) cb(value, name);
      },
    },
    // Body accessors — must never be called by the passive path.
    text: vi.fn(),
    json: vi.fn(),
    clone: vi.fn(),
  };
}

/** A clock returning each queued value in turn, then repeating the last. */
function clock(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
}

function fetchScope(impl: () => Promise<unknown>): NetworkCaptureScope {
  return { fetch: vi.fn(impl) } as unknown as NetworkCaptureScope;
}

/** A fresh XMLHttpRequest stand-in per test, so prototype patching never leaks across tests. */
function makeFakeXhrClass() {
  return class FakeXhr {
    method = '';
    url = '';
    status = 0;
    statusText = '';
    private responseHeaders = '';
    private listeners: Record<string, Array<() => void>> = {};

    open(method: string, url: string): void {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(_name: string, _value: string): void {}
    send(_body?: unknown): void {}
    addEventListener(type: string, cb: () => void): void {
      (this.listeners[type] ??= []).push(cb);
    }
    getAllResponseHeaders(): string {
      return this.responseHeaders;
    }
    /** Test helper: simulate the response arriving and the request settling. */
    complete(init: { status: number; statusText?: string; responseHeaders?: string }): void {
      this.status = init.status;
      this.statusText = init.statusText ?? '';
      this.responseHeaders = init.responseHeaders ?? '';
      for (const cb of this.listeners['loadend'] ?? []) cb();
    }
  };
}

describe('installNetworkRingBuffer — fetch', () => {
  it('captures fetch metadata and returns the original response untouched', async () => {
    const response = fakeResponse({
      status: 201,
      statusText: 'Created',
      headers: { 'content-type': 'application/json' },
    });
    const scope = fetchScope(() => Promise.resolve(response));
    const buffer = installNetworkRingBuffer(scope, { now: clock([100, 250]) });

    const returned = await scope.fetch!('https://x.test/api', {
      method: 'post',
      headers: { 'x-test': '1' },
    });

    expect(returned).toBe(response); // pass-through, original response untouched
    const entry = buffer.snapshot()[0]!;
    expect(entry).toMatchObject({
      initiator: 'fetch',
      url: 'https://x.test/api',
      method: 'POST',
      status: 201,
      statusText: 'Created',
      startedAt: 100,
      endedAt: 250,
      durationMs: 150,
      failed: false,
      errorText: null,
    });
    expect(entry.requestHeaders).toContainEqual({ name: 'x-test', value: '1' });
    expect(entry.responseHeaders).toContainEqual({
      name: 'content-type',
      value: 'application/json',
    });
  });

  it('never reads the response body', async () => {
    const response = fakeResponse({ status: 200 });
    const scope = fetchScope(() => Promise.resolve(response));
    const buffer = installNetworkRingBuffer(scope);

    await scope.fetch!('https://x.test');

    expect(response.text).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
    expect(response.clone).not.toHaveBeenCalled();
    expect(Object.keys(buffer.snapshot()[0]!)).not.toContain('body');
  });

  it('defaults the method to GET and derives url/method from a Request-like input', async () => {
    const scope = fetchScope(() => Promise.resolve(fakeResponse({ status: 200 })));
    const buffer = installNetworkRingBuffer(scope);

    await scope.fetch!('https://x.test/a'); // string, no init
    await scope.fetch!({
      url: 'https://x.test/b',
      method: 'delete',
      headers: { 'x-h': 'v' },
    } as unknown as Request); // Request-like

    const [first, second] = buffer.snapshot();
    expect(first).toMatchObject({ url: 'https://x.test/a', method: 'GET' });
    expect(second).toMatchObject({ url: 'https://x.test/b', method: 'DELETE' });
    expect(second!.requestHeaders).toContainEqual({ name: 'x-h', value: 'v' });
  });

  it('records a failed fetch without swallowing the rejection', async () => {
    const scope = fetchScope(() => Promise.reject(new Error('network down')));
    const buffer = installNetworkRingBuffer(scope, { now: clock([10, 40]) });

    await expect(scope.fetch!('https://x.test')).rejects.toThrow('network down');

    const entry = buffer.snapshot()[0]!;
    expect(entry.failed).toBe(true);
    expect(entry.status).toBeNull();
    expect(entry.statusText).toBeNull();
    expect(entry.errorText).toContain('network down');
    expect(entry.durationMs).toBe(30);
  });

  it('caps the buffer at maxSize, dropping the oldest', async () => {
    const scope = fetchScope(() => Promise.resolve(fakeResponse({ status: 200 })));
    const buffer = installNetworkRingBuffer(scope, { maxSize: 3 });

    for (let i = 0; i < 5; i += 1) await scope.fetch!(`https://x.test/${i}`);

    expect(buffer.snapshot().map((e) => e.url)).toEqual([
      'https://x.test/2',
      'https://x.test/3',
      'https://x.test/4',
    ]);
  });
});

describe('installNetworkRingBuffer — XMLHttpRequest', () => {
  it('captures XHR metadata on loadend', () => {
    const FakeXhr = makeFakeXhrClass();
    const scope: NetworkCaptureScope = {
      XMLHttpRequest: FakeXhr as unknown as typeof XMLHttpRequest,
    };
    const buffer = installNetworkRingBuffer(scope, { now: clock([5, 35]) });

    const xhr = new FakeXhr();
    xhr.open('get', 'https://x.test/data');
    xhr.setRequestHeader('x-test', '1');
    xhr.send();
    xhr.complete({
      status: 200,
      statusText: 'OK',
      responseHeaders: 'content-type: text/plain\r\nx-foo: bar\r\n',
    });

    const entry = buffer.snapshot()[0]!;
    expect(entry).toMatchObject({
      initiator: 'xhr',
      method: 'GET',
      url: 'https://x.test/data',
      status: 200,
      statusText: 'OK',
      startedAt: 5,
      endedAt: 35,
      durationMs: 30,
      failed: false,
    });
    expect(entry.requestHeaders).toContainEqual({ name: 'x-test', value: '1' });
    expect(entry.responseHeaders).toContainEqual({ name: 'content-type', value: 'text/plain' });
  });

  it('never captures the XHR request body', () => {
    const FakeXhr = makeFakeXhrClass();
    const scope: NetworkCaptureScope = {
      XMLHttpRequest: FakeXhr as unknown as typeof XMLHttpRequest,
    };
    const buffer = installNetworkRingBuffer(scope);

    const xhr = new FakeXhr();
    xhr.open('POST', 'https://x.test');
    xhr.send('secret-body');
    xhr.complete({ status: 204 });

    expect(Object.keys(buffer.snapshot()[0]!)).not.toContain('body');
  });
});

describe('installNetworkRingBuffer — lifecycle', () => {
  it('restores fetch and XHR and stops capturing on uninstall', async () => {
    const FakeXhr = makeFakeXhrClass();
    const originalFetch = vi.fn(() => Promise.resolve(fakeResponse({ status: 200 })));
    const scope = {
      fetch: originalFetch,
      XMLHttpRequest: FakeXhr,
    } as unknown as NetworkCaptureScope;
    /* eslint-disable @typescript-eslint/unbound-method --
       Reading the prototype method reference is the point here: we assert it is patched and then
       restored to the exact original. */
    const originalOpen = FakeXhr.prototype.open;

    const buffer = installNetworkRingBuffer(scope);
    expect(scope.fetch).not.toBe(originalFetch); // patched while installed
    expect(FakeXhr.prototype.open).not.toBe(originalOpen);

    buffer.uninstall();
    expect(scope.fetch).toBe(originalFetch); // restored
    expect(FakeXhr.prototype.open).toBe(originalOpen);
    /* eslint-enable @typescript-eslint/unbound-method */

    await scope.fetch!('https://x.test');
    const xhr = new FakeXhr();
    xhr.open('GET', 'https://x.test');
    xhr.send();
    xhr.complete({ status: 200 });
    expect(buffer.snapshot()).toEqual([]); // nothing recorded after uninstall
  });

  it('does not throw when fetch or XMLHttpRequest is unavailable', () => {
    expect(() => installNetworkRingBuffer({})).not.toThrow();
  });

  it('defaults to a 500-entry buffer', () => {
    expect(DEFAULT_NETWORK_BUFFER_SIZE).toBe(500);
  });
});
