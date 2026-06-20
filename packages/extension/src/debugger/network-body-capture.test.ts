import { describe, expect, it } from 'vitest';

import type { DebuggerSession } from './debugger-session';
import { captureNetworkBodies } from './network-body-capture';

type BodyReply = { body: string; base64Encoded: boolean } | Error;

function makeFakeSession(bodies: Record<string, BodyReply>): {
  session: DebuggerSession;
  emit: (method: string, params: unknown) => void;
} {
  const handlers = new Map<string, Set<(params: unknown) => void>>();
  const session: DebuggerSession = {
    target: { tabId: 1 },
    drainMs: 0,
    sendCommand: (method, params) => {
      if (method === 'Network.getResponseBody') {
        const id = (params as { requestId: string }).requestId;
        const reply = bodies[id];
        if (reply instanceof Error) {
          return Promise.reject(reply);
        }
        if (!reply) {
          return Promise.reject(new Error(`no body for ${id}`));
        }
        return Promise.resolve(reply);
      }
      return Promise.resolve({});
    },
    on: (method, handler) => {
      const set = handlers.get(method) ?? new Set();
      set.add(handler);
      handlers.set(method, set);
      return () => set.delete(handler);
    },
  };
  return {
    session,
    emit: (method, params) => {
      for (const handler of handlers.get(method) ?? []) {
        handler(params);
      }
    },
  };
}

const response = (requestId: string, url: string, mimeType: string | null) => ({
  requestId,
  response: { url, ...(mimeType === null ? {} : { mimeType }) },
});

const noWait = { wait: async () => {} };

describe('captureNetworkBodies', () => {
  it('collects a finished request body under the cap without truncating', async () => {
    const { session, emit } = makeFakeSession({ '1': { body: 'hello', base64Encoded: false } });
    const promise = captureNetworkBodies(session, { maxBodyBytes: 100, drainMs: 0 }, noWait);
    emit('Network.responseReceived', response('1', 'https://x/a', 'text/plain'));
    emit('Network.loadingFinished', { requestId: '1' });
    const bodies = await promise;
    expect(bodies).toEqual([
      {
        requestId: '1',
        url: 'https://x/a',
        mimeType: 'text/plain',
        sizeBytes: 5,
        text: 'hello',
        truncated: false,
      },
    ]);
  });

  it('truncates a text body larger than the cap and reports the original size', async () => {
    const { session, emit } = makeFakeSession({
      '1': { body: 'hello world', base64Encoded: false },
    });
    const promise = captureNetworkBodies(session, { maxBodyBytes: 5, drainMs: 0 }, noWait);
    emit('Network.responseReceived', response('1', 'https://x/a', 'text/plain'));
    emit('Network.loadingFinished', { requestId: '1' });
    const [body] = await promise;
    expect(body).toMatchObject({ text: 'hello', sizeBytes: 11, truncated: true });
  });

  it('truncates an oversized base64 body', async () => {
    const { session, emit } = makeFakeSession({
      '1': { body: btoa('abcdefghij'), base64Encoded: true },
    });
    const promise = captureNetworkBodies(session, { maxBodyBytes: 4, drainMs: 0 }, noWait);
    emit('Network.responseReceived', response('1', 'https://x/img', 'image/png'));
    emit('Network.loadingFinished', { requestId: '1' });
    const [body] = await promise;
    expect(body).toMatchObject({ base64: btoa('abcd'), sizeBytes: 10, truncated: true });
    expect(body?.text).toBeUndefined();
  });

  it('ignores requests that never finished', async () => {
    const { session, emit } = makeFakeSession({ '1': { body: 'x', base64Encoded: false } });
    const promise = captureNetworkBodies(session, { maxBodyBytes: 100, drainMs: 0 }, noWait);
    emit('Network.responseReceived', response('1', 'https://x/a', 'text/plain'));
    // no loadingFinished
    expect(await promise).toEqual([]);
  });

  it('skips a request whose body cannot be fetched, without throwing', async () => {
    const { session, emit } = makeFakeSession({
      '1': new Error('No resource with given identifier found'),
      '2': { body: 'ok', base64Encoded: false },
    });
    const promise = captureNetworkBodies(session, { maxBodyBytes: 100, drainMs: 0 }, noWait);
    emit('Network.responseReceived', response('1', 'https://x/a', 'text/plain'));
    emit('Network.loadingFinished', { requestId: '1' });
    emit('Network.responseReceived', response('2', 'https://x/b', 'text/plain'));
    emit('Network.loadingFinished', { requestId: '2' });
    const bodies = await promise;
    expect(bodies.map((b) => b.requestId)).toEqual(['2']);
  });

  it('returns an empty list when no traffic occurs', async () => {
    const { session } = makeFakeSession({});
    expect(await captureNetworkBodies(session, { maxBodyBytes: 100, drainMs: 0 }, noWait)).toEqual(
      [],
    );
  });

  it('preserves finished order across multiple bodies and a null mime type', async () => {
    const { session, emit } = makeFakeSession({
      a: { body: '1', base64Encoded: false },
      b: { body: '2', base64Encoded: false },
    });
    const promise = captureNetworkBodies(session, { maxBodyBytes: 100, drainMs: 0 }, noWait);
    emit('Network.responseReceived', response('a', 'https://x/a', null));
    emit('Network.responseReceived', response('b', 'https://x/b', 'text/plain'));
    emit('Network.loadingFinished', { requestId: 'b' });
    emit('Network.loadingFinished', { requestId: 'a' });
    const bodies = await promise;
    expect(bodies.map((b) => b.requestId)).toEqual(['b', 'a']);
    expect(bodies.find((b) => b.requestId === 'a')?.mimeType).toBeNull();
  });
});
