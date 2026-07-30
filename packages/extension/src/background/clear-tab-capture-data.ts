/**
 * Single choke point for wiping a tab's captured data (BUG-06 follow-up).
 *
 * The user's rule: the overlay is a fresh canvas every time it opens. Closing it — via its own ×,
 * the toolbar icon, after a download, or by closing the tab — must discard everything that could
 * still be sitting in `chrome.storage.session` for that tab: the draft form (severity, notes,
 * options, element inspections), the reproduction recording (tracked steps), and the passive error
 * count/badge. Before this module, `recordingClient.clear()` only ran on the post-download path, so
 * closing the overlay any other way left a completed recording behind — reopening restored it and
 * showed "Track again" instead of a clean form (the reported bug).
 *
 * This intentionally does NOT touch: the overlay-open flag (`storage/overlay-session` — overlay
 * lifecycle, not captured data, and clearing it here would fight the BUG-05 navigation re-mount
 * logic), user settings, optional permissions, the origin allowlist, or report history. The user was
 * explicit that only captured data should be wiped, never permissions or settings.
 *
 * Each clear is independent and best-effort (`Promise.allSettled`): every underlying clear already
 * swallows its own storage errors, but this guarantees one failing can never stop the others from
 * running, even if that changes later.
 */

import { clearOverlayDraft, type OverlayDraftDeps } from '../storage/overlay-draft';
import { clearRecordingSession, type RecordingSessionDeps } from '../storage/recording-session';

import { clearPassiveErrorBadge, type PassiveErrorBadgeDeps } from './passive-error-badge';

export interface ClearTabCaptureDataDeps {
  /** Forwarded to `clearOverlayDraft`; injected in tests. */
  readonly overlayDraft?: OverlayDraftDeps;
  /** Forwarded to `clearRecordingSession`; injected in tests. */
  readonly recordingSession?: RecordingSessionDeps;
  /** Forwarded to `clearPassiveErrorBadge`; injected in tests. */
  readonly passiveErrorBadge?: PassiveErrorBadgeDeps;
}

/** Wipe every captured-data store for a tab: the overlay draft, the recording, and the error badge. */
export async function clearTabCaptureData(
  tabId: number,
  deps: ClearTabCaptureDataDeps = {},
): Promise<void> {
  await Promise.allSettled([
    clearOverlayDraft(tabId, deps.overlayDraft ?? {}),
    clearRecordingSession(tabId, deps.recordingSession ?? {}),
    clearPassiveErrorBadge(tabId, deps.passiveErrorBadge ?? {}),
  ]);
}
