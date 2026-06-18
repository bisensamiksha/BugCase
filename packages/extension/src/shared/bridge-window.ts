/**
 * The slice of `window` the cross-world bridge depends on for `postMessage` messaging.
 * Declared structurally (rather than using the full DOM `Window`) so the bridge endpoints can be
 * driven by a deterministic fake in tests — the same dependency-injection pattern the rest of the
 * extension uses for `chrome.storage` / `chrome.scripting`. The real `window` satisfies it.
 */
export interface BridgeMessageEvent {
  readonly data: unknown;
  /** The window that sent the message; used to ignore cross-frame / foreign-source traffic. */
  readonly source: unknown;
  readonly origin?: string;
}

export interface BridgeWindow {
  postMessage(message: unknown, targetOrigin: string): void;
  addEventListener(type: 'message', listener: (event: BridgeMessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: BridgeMessageEvent) => void): void;
}
