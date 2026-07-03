import browser, { type Runtime } from 'webextension-polyfill';

import { KEEPALIVE_PORT_NAME } from '../background/messages';

/** Minimal port surface the keepalive needs; a real `Runtime.Port` satisfies it. */
export interface KeepAlivePort {
  postMessage(message: unknown): void;
  disconnect(): void;
}

export interface KeepAliveHandle {
  /** Stop pinging and disconnect, letting the worker idle out normally. */
  stop(): void;
}

export interface KeepAliveDeps {
  /** Opens the keepalive port; `null` when the runtime can't (e.g. unit tests). Defaults to the bridge. */
  readonly connect?: () => KeepAlivePort | null;
  readonly setInterval?: (handler: () => void, ms: number) => ReturnType<typeof setInterval>;
  readonly clearInterval?: (id: ReturnType<typeof setInterval>) => void;
  /** Ping cadence; must stay under the ~30s MV3 idle timeout. */
  readonly intervalMs?: number;
}

const NOOP_HANDLE: KeepAliveHandle = { stop() {} };

/** Open the real keepalive port via the runtime bridge; `null` when `connect` is unavailable. */
function defaultConnect(): KeepAlivePort | null {
  const runtime = browser.runtime as Runtime.Static | undefined;
  if (!runtime || typeof runtime.connect !== 'function') {
    return null;
  }
  return runtime.connect({ name: KEEPALIVE_PORT_NAME });
}

/**
 * Keep the MV3 service worker alive while a report is held for preview/annotation, so a long idle
 * annotation session doesn't evict the in-memory report hold (which the user hits as
 * "This capture expired before download"). Opens a long-lived port and pings it under the idle
 * timeout — the connection + messages reset the worker's timer. `stop()` clears the timer and
 * disconnects. No-ops when the runtime can't open a port (unit tests, or a torn-down context).
 */
export function startServiceWorkerKeepAlive(deps: KeepAliveDeps = {}): KeepAliveHandle {
  const port = (deps.connect ?? defaultConnect)();
  if (!port) {
    return NOOP_HANDLE;
  }

  const setIntervalFn = deps.setInterval ?? setInterval;
  const clearIntervalFn = deps.clearInterval ?? clearInterval;
  const intervalMs = deps.intervalMs ?? 20_000;

  const timer = setIntervalFn(() => {
    try {
      port.postMessage({ type: KEEPALIVE_PORT_NAME });
    } catch {
      // The port may drop if the worker was killed for another reason; the next mount reconnects.
    }
  }, intervalMs);

  return {
    stop() {
      clearIntervalFn(timer);
      try {
        port.disconnect();
      } catch {
        // Already disconnected.
      }
    },
  };
}
