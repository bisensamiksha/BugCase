import { createFlushResponse, isFlushRequest, type FlushChannel } from '../shared/bridge-protocol';
import type { BridgeMessageEvent, BridgeWindow } from '../shared/bridge-window';

/** Supplies the current buffered entries for a channel. Registered by the ring buffers (S2-06/S2-07). */
export type FlushProvider = () => readonly unknown[];

export interface PageBridgeClient {
  /** Register the source of entries for a channel; the latest registration wins. */
  registerFlushProvider(channel: FlushChannel, provider: FlushProvider): void;
  /** Detach the message listener. */
  dispose(): void;
}

/**
 * MAIN-world side of the bridge. Lives where the ring buffers live and answers flush-requests from
 * the isolated content script with the buffered entries, over `window.postMessage`.
 *
 * Anti-spoof: `window.postMessage` is observable by the page, so a flush would otherwise leak the
 * buffer to any page script that forged a request. The client pins the first requester's verifier
 * token (trust-on-first-use — our content script runs at document_start, ahead of page scripts) and
 * thereafter only answers requests bearing that token. This is best-effort, not a secrecy boundary.
 */
export function installPageBridgeClient(win: BridgeWindow): PageBridgeClient {
  const providers = new Map<FlushChannel, FlushProvider>();
  let pinnedToken: string | null = null;

  const onMessage = (event: BridgeMessageEvent): void => {
    if (event.source !== win) {
      return; // only same-window messages — ignore other frames / foreign sources
    }
    const message = event.data;
    if (!isFlushRequest(message)) {
      return;
    }
    if (pinnedToken === null) {
      pinnedToken = message.token;
    }
    if (message.token !== pinnedToken) {
      return; // page-spoofed look-alike
    }

    let entries: readonly unknown[] = [];
    const provider = providers.get(message.channel);
    if (provider) {
      try {
        entries = provider();
      } catch {
        entries = [];
      }
    }
    win.postMessage(createFlushResponse(message, entries), '*');
  };

  win.addEventListener('message', onMessage);

  return {
    registerFlushProvider(channel, provider) {
      providers.set(channel, provider);
    },
    dispose() {
      win.removeEventListener('message', onMessage);
    },
  };
}
