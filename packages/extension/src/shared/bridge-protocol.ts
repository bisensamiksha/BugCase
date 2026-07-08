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
export type FlushChannel = 'console' | 'network' | 'reproduction';

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

/**
 * Isolated world → MAIN world: arm or disarm the reproduction recorder (S3-12).
 *
 * Deliberately a distinct message kind, not a flush-request: the MAIN-world bridge client pins the
 * first flush-request's token forever (trust-on-first-use), so routing recorder control through a
 * flush would poison the capture-time console/network flush token. Control carries no captured data,
 * so like the rest of the bridge it is best-effort authenticity (source tag + session token), not a
 * secrecy boundary.
 */
export interface RecorderControlMessage extends BridgeEnvelope {
  readonly kind: 'recorder-control';
  readonly action: 'start' | 'stop';
}

/**
 * MAIN world → isolated world: one recorded reproduction step, pushed as it happens (S3-12, Part B).
 *
 * The recorder buffers in the page's MAIN world, which a navigation destroys; relaying each step to the
 * overlay (which persists it via the service worker) is what lets a recording survive page changes.
 * `step` is an opaque record — the report mapper coerces it. `token` is the recording's session token,
 * so the overlay can ignore page-forged steps.
 */
export interface RecorderStepMessage extends BridgeEnvelope {
  readonly kind: 'recorder-step';
  readonly step: unknown;
}

/**
 * MAIN world → isolated world: an uncaught error just occurred (S3-14). A signal only — no payload —
 * so the isolated passive-bridge can relay a count to the worker for the toolbar badge. Token-free:
 * it carries no data and only bumps a per-tab count, so source-tag authenticity is enough.
 */
export interface PassiveErrorMessage {
  readonly source: typeof BUGCASE_BRIDGE_SOURCE;
  readonly kind: 'passive-error';
}

export type BridgeMessage =
  | BridgeFlushRequest
  | BridgeFlushResponse
  | RecorderControlMessage
  | RecorderStepMessage
  | PassiveErrorMessage;

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

export function createRecorderControl(
  action: RecorderControlMessage['action'],
  token: string,
): RecorderControlMessage {
  return {
    source: BUGCASE_BRIDGE_SOURCE,
    kind: 'recorder-control',
    action,
    token,
  };
}

export function createPassiveError(): PassiveErrorMessage {
  return { source: BUGCASE_BRIDGE_SOURCE, kind: 'passive-error' };
}

export function createRecorderStep(step: unknown, token: string): RecorderStepMessage {
  return {
    source: BUGCASE_BRIDGE_SOURCE,
    kind: 'recorder-step',
    step,
    token,
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

export function isRecorderControl(value: unknown): value is RecorderControlMessage {
  return hasBridgeSource(value) && value.kind === 'recorder-control';
}

export function isRecorderStep(value: unknown): value is RecorderStepMessage {
  return hasBridgeSource(value) && value.kind === 'recorder-step';
}

export function isPassiveError(value: unknown): value is PassiveErrorMessage {
  return hasBridgeSource(value) && value.kind === 'passive-error';
}

export function isBridgeMessage(value: unknown): value is BridgeMessage {
  return (
    isFlushRequest(value) ||
    isFlushResponse(value) ||
    isRecorderControl(value) ||
    isRecorderStep(value) ||
    isPassiveError(value)
  );
}

/** Whether `message` is from our bridge and bears the expected verifier token. */
export function tokenMatches(message: BridgeMessage, token: string): boolean {
  // Not every bridge message carries a token (e.g. the token-free passive-error signal); read it
  // defensively so those simply never match.
  return (
    message.source === BUGCASE_BRIDGE_SOURCE && (message as { token?: unknown }).token === token
  );
}
