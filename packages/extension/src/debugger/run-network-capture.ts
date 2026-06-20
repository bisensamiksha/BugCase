/**
 * Orchestrates one on-demand debugger network capture (S2-10).
 *
 * Guards the whole operation: it no-ops (without throwing) when `chrome.debugger` is unavailable
 * (e.g. Firefox) or the optional `debugger` permission is not granted, then attaches via
 * {@link withDebuggerSession}, collects response bodies via {@link captureNetworkBodies} using the
 * configured size cap, and detaches. Any failure resolves to `{ ok: false, reason }`.
 */

import { hasOptionalPermissions } from '../permissions/optional-permissions';

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
  extends DebuggerSessionDeps, NetworkBodyCaptureDeps, DebuggerSettingsDeps {
  /** Checks the `debugger` optional permission; defaults to `hasOptionalPermissions`. */
  readonly hasPermission?: () => Promise<boolean>;
}

export async function runDebuggerNetworkCapture(
  options: RunDebuggerNetworkCaptureOptions,
  deps: RunDebuggerNetworkCaptureDeps = {},
): Promise<DebuggerNetworkCaptureResult> {
  try {
    if (!isDebuggerApiAvailable(deps)) {
      return { ok: false, bodies: [], reason: 'chrome.debugger is unavailable (Chromium only)' };
    }
    const hasPermission =
      deps.hasPermission ?? (() => hasOptionalPermissions({ permissions: ['debugger'] }));
    if (!(await hasPermission())) {
      return { ok: false, bodies: [], reason: 'debugger permission not granted' };
    }

    const settings = await getDebuggerCaptureSettings(deps);
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
