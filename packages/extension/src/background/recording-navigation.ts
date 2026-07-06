/**
 * Continue a reproduction recording across a page navigation (S3-12).
 *
 * When a tab with an active recording finishes loading a new page, the overlay + recorder were
 * destroyed with the old document — so the worker re-injects them (mount, not toggle) and the overlay
 * resumes recording. Navigation is observed via `chrome.tabs.onUpdated` (the `tabs` permission we
 * already hold), so no extra permission is needed.
 */

import type { RecordingSession } from '../storage/recording-session';

export interface RecordingNavigationDeps {
  /** Read the durable recording session for a tab. */
  readonly getRecording: (tabId: number) => Promise<RecordingSession | null>;
  /** Re-inject the recorder + overlay into a tab to continue recording. */
  readonly reinject: (tabId: number) => Promise<unknown>;
}

export type RecordingNavigationHandler = (
  tabId: number,
  status: string | undefined,
  url: string | undefined,
) => Promise<void>;

export function createRecordingNavigationHandler(
  deps: RecordingNavigationDeps,
): RecordingNavigationHandler {
  return async function onNavigated(tabId, status, url): Promise<void> {
    if (status !== 'complete' || !url || !/^https?:/i.test(url)) {
      return;
    }
    const session = await deps.getRecording(tabId);
    if (session?.status !== 'recording') {
      return;
    }
    await deps.reinject(tabId);
  };
}
