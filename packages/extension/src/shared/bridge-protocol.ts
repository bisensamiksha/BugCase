/**
 * Wire protocol for the cross-world bridge (S2-05).
 *
 * Passive capture runs in the page's MAIN world (the ring buffers, S2-06/S2-07), but only the
 * isolated content-script world can reach `chrome.runtime` to hand data to the service worker.
 * The two worlds share a page but not a JS context, so they talk over `window.postMessage`.
 *
 * `window.postMessage` is observable by the page itself, so every message carries a `source` tag
 * (to ignore unrelated postMessage traffic) and a per-session **verifier token** (so each side
 * only acts on messages from its counterpart, not page-spoofed look-alikes). The token is a
 * best-effort authenticity check, not a secrecy boundary — postMessage payloads are not private.
 */

/** Tag identifying a message as part of the BugCase bridge. */
export const BUGCASE_BRIDGE_SOURCE = 'bugcase-bridge' as const;

/** Buffers that can be flushed across the bridge. */
export type FlushChannel = 'console' | 'network';

interface BridgeEnvelope {
  readonly source: typeof BUGCASE_BRIDGE_SOURCE;
  readonly token: string;
}

/** Isolated world → MAIN world: "send me your buffered `channel` entries". */
export interface BridgeFlushRequest extends BridgeEnvelope {
  readonly kind: 'flush-request';
  readonly channel: FlushChannel;
  /** Correlates a response to its request. */
  readonly id: string;
}

/** MAIN world → isolated world: the buffered entries for a prior request. */
export interface BridgeFlushResponse extends BridgeEnvelope {
  readonly kind: 'flush-response';
  readonly channel: FlushChannel;
  readonly id: string;
  readonly entries: readonly unknown[];
}

export type BridgeMessage = BridgeFlushRequest | BridgeFlushResponse;

/** Generate a random, hard-to-guess token (verifier token, also reused for correlation ids). */
export function createVerifierToken(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createFlushRequest(channel: FlushChannel, token: string): BridgeFlushRequest {
  return {
    source: BUGCASE_BRIDGE_SOURCE,
    kind: 'flush-request',
    channel,
    id: createVerifierToken(),
    token,
  };
}

export function createFlushResponse(
  request: BridgeFlushRequest,
  entries: readonly unknown[],
): BridgeFlushResponse {
  return {
    source: BUGCASE_BRIDGE_SOURCE,
    kind: 'flush-response',
    channel: request.channel,
    id: request.id,
    token: request.token,
    entries,
  };
}

function hasBridgeSource(value: unknown): value is BridgeEnvelope & { kind: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { source?: unknown }).source === BUGCASE_BRIDGE_SOURCE
  );
}

export function isFlushRequest(value: unknown): value is BridgeFlushRequest {
  return hasBridgeSource(value) && value.kind === 'flush-request';
}

export function isFlushResponse(value: unknown): value is BridgeFlushResponse {
  return hasBridgeSource(value) && value.kind === 'flush-response';
}

export function isBridgeMessage(value: unknown): value is BridgeMessage {
  return isFlushRequest(value) || isFlushResponse(value);
}

/** Whether `message` is from our bridge and bears the expected verifier token. */
export function tokenMatches(message: BridgeMessage, token: string): boolean {
  return message.source === BUGCASE_BRIDGE_SOURCE && message.token === token;
}
