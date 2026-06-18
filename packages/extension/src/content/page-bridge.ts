import {
  createFlushRequest,
  createVerifierToken,
  isFlushResponse,
  tokenMatches,
  type FlushChannel,
} from '../shared/bridge-protocol';
import type { BridgeMessageEvent, BridgeWindow } from '../shared/bridge-window';

export interface PageBridge {
  /** The verifier token this bridge tags its requests with and validates responses against. */
  readonly token: string;
  /** Request the MAIN world's buffered entries for `channel`. Resolves `[]` if nothing answers. */
  flush(channel: FlushChannel): Promise<readonly unknown[]>;
  /** Detach the message listener and drop any in-flight requests. */
  dispose(): void;
}

export interface PageBridgeOptions {
  /** How long to wait for a flush response before resolving empty. Default 1000ms. */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 1000;

/**
 * Isolated content-script side of the bridge. It owns the verifier token and the `flush` API the
 * service-worker-triggered capture (later tickets) calls to pull buffered console/network entries
 * out of the MAIN world over `window.postMessage`. A flush always settles: if no MAIN-world
 * responder exists (e.g. a not-yet-injected page), it resolves `[]` after `timeoutMs` rather than
 * hanging. Responses are accepted only when they carry this bridge's token and match a live request.
 */
export function createPageBridge(win: BridgeWindow, options: PageBridgeOptions = {}): PageBridge {
  const token = createVerifierToken();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pending = new Map<string, (entries: readonly unknown[]) => void>();

  const onMessage = (event: BridgeMessageEvent): void => {
    if (event.source !== win) {
      return;
    }
    const message = event.data;
    if (!isFlushResponse(message) || !tokenMatches(message, token)) {
      return;
    }
    const settle = pending.get(message.id);
    if (!settle) {
      return; // unknown / already-settled correlation id
    }
    pending.delete(message.id);
    settle(message.entries);
  };

  win.addEventListener('message', onMessage);

  function flush(channel: FlushChannel): Promise<readonly unknown[]> {
    const request = createFlushRequest(channel, token);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(request.id);
        resolve([]);
      }, timeoutMs);
      pending.set(request.id, (entries) => {
        clearTimeout(timer);
        resolve(entries);
      });
      win.postMessage(request, '*');
    });
  }

  return {
    token,
    flush,
    dispose() {
      win.removeEventListener('message', onMessage);
      pending.clear();
    },
  };
}
