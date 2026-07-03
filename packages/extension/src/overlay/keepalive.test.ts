import { describe, expect, it, vi } from 'vitest';

// keepalive imports the polyfill for its default port; stub it so the import succeeds in node.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import { startServiceWorkerKeepAlive } from './keepalive';

function fakePort() {
  return { postMessage: vi.fn(), disconnect: vi.fn() };
}

describe('startServiceWorkerKeepAlive', () => {
  it('opens a port and pings it on an interval under the ~30s idle timeout', () => {
    const port = fakePort();
    let tick: (() => void) | undefined;
    const setIntervalFn = vi.fn((fn: () => void, _ms: number) => {
      tick = fn;
      return 1 as unknown as ReturnType<typeof setInterval>;
    });

    startServiceWorkerKeepAlive({
      connect: () => port,
      setInterval: setIntervalFn,
      clearInterval: vi.fn(),
    });

    expect(setIntervalFn).toHaveBeenCalledTimes(1);
    expect(setIntervalFn.mock.calls[0]![1]).toBeLessThan(30_000);
    // The message itself is what resets the worker's idle timer; it fires on each interval tick.
    expect(port.postMessage).not.toHaveBeenCalled();
    tick?.();
    expect(port.postMessage).toHaveBeenCalledTimes(1);
  });

  it('stop() clears the ping interval and disconnects the port', () => {
    const port = fakePort();
    const clearIntervalFn = vi.fn();
    const handle = startServiceWorkerKeepAlive({
      connect: () => port,
      setInterval: () => 42 as unknown as ReturnType<typeof setInterval>,
      clearInterval: clearIntervalFn,
    });

    handle.stop();

    expect(clearIntervalFn).toHaveBeenCalledWith(42);
    expect(port.disconnect).toHaveBeenCalledTimes(1);
  });

  it('no-ops safely when the runtime cannot open a port', () => {
    const handle = startServiceWorkerKeepAlive({ connect: () => null });
    expect(() => handle.stop()).not.toThrow();
  });

  it('does not throw with the default (mocked) runtime bridge', () => {
    expect(() => startServiceWorkerKeepAlive().stop()).not.toThrow();
  });
});
