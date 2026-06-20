/**
 * Orchestrates one on-demand debugger network capture (S2-10).
 *
 * Guards the whole operation: it no-ops (without throwing) when `chrome.debugger` is unavailable
 * (e.g. Firefox) or the user hasn't opted in (the stored `enabled` flag is off), then attaches via
 * {@link withDebuggerSession}, collects response bodies via {@link captureNetworkBodies} using the
 * configured size cap, and detaches. Any failure resolves to `{ ok: false, reason }`.
 *
 * `debugger` is a required permission (Chrome forbids it as optional), so the opt-in is the stored
 * flag — not a runtime permission grant.
 */

import { getDebuggerCaptureSettings, type DebuggerSettingsDeps } from './config';
import {
  isDebuggerApiAvailable,
  withDebuggerSession,
  type DebuggerSessionDeps,
} from './debugger-session';
import {
  captureNetworkBodies,
  type CapturedResponseBody,
  type NetworkBodyCaptureDeps,
} from './network-body-capture';

/** Default drain window — "around 500 ms" per the capture plan. */
export const DEFAULT_DEBUGGER_DRAIN_MS = 500;

export interface RunDebuggerNetworkCaptureOptions {
  readonly tabId: number;
  /** Defaults to {@link DEFAULT_DEBUGGER_DRAIN_MS}. */
  readonly drainMs?: number;
}

export interface DebuggerNetworkCaptureResult {
  readonly ok: boolean;
  readonly bodies: readonly CapturedResponseBody[];
  readonly reason?: string;
}

export interface RunDebuggerNetworkCaptureDeps
  extends DebuggerSessionDeps, NetworkBodyCaptureDeps, DebuggerSettingsDeps {}

export async function runDebuggerNetworkCapture(
  options: RunDebuggerNetworkCaptureOptions,
  deps: RunDebuggerNetworkCaptureDeps = {},
): Promise<DebuggerNetworkCaptureResult> {
  try {
    if (!isDebuggerApiAvailable(deps)) {
      return { ok: false, bodies: [], reason: 'chrome.debugger is unavailable (Chromium only)' };
    }

    const settings = await getDebuggerCaptureSettings(deps);
    if (!settings.enabled) {
      return { ok: false, bodies: [], reason: 'debugger capture is disabled' };
    }

    const drainMs = options.drainMs ?? DEFAULT_DEBUGGER_DRAIN_MS;

    const bodies = await withDebuggerSession(
      { tabId: options.tabId, drainMs },
      (session) =>
        captureNetworkBodies(session, { maxBodyBytes: settings.maxBodyBytes, drainMs }, deps),
      deps,
    );

    return { ok: true, bodies };
  } catch (error) {
    return {
      ok: false,
      bodies: [],
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
