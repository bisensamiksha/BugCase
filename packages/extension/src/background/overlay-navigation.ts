/**
 * Keep an open overlay across page navigations (BUG-05).
 *
 * The overlay host is destroyed with the old document on every navigation. S3-12 already restores it
 * for an active *recording* (see recording-navigation.ts), but a plain overlay open had no such
 * recovery: a page that self-navigates shortly after injection (common on login pages and hydrating
 * SPAs) silently dropped the overlay with no user feedback, so the toolbar button looked broken.
 *
 * While the overlay is open in a tab, re-mount it after each completed navigation — the same rule the
 * recording path uses — until the user explicitly closes it. Navigation is observed via
 * `chrome.tabs.onUpdated` (the `tabs` permission we already hold), so no extra permission is needed.
 */

export interface OverlayNavigationDeps {
  /** Whether the user has the overlay open in this tab (see storage/overlay-session). */
  readonly isOverlayOpen: (tabId: number) => Promise<boolean>;
  /** Whether a reproduction recording is active; that path re-injects on its own. */
  readonly isRecording: (tabId: number) => Promise<boolean>;
  /** Re-inject the overlay into a tab (mount, not toggle). */
  readonly reinject: (tabId: number) => Promise<unknown>;
}

export type OverlayNavigationHandler = (
  tabId: number,
  status: string | undefined,
  url: string | undefined,
) => Promise<void>;

export function createOverlayNavigationHandler(
  deps: OverlayNavigationDeps,
): OverlayNavigationHandler {
  return async function onNavigated(tabId, status, url): Promise<void> {
    if (status !== 'complete' || !url || !/^https?:/i.test(url)) {
      return;
    }
    if (!(await deps.isOverlayOpen(tabId))) {
      return;
    }
    // An active recording already re-injects via recording-navigation; injecting twice for one
    // navigation would run the content entry twice for the same load.
    if (await deps.isRecording(tabId)) {
      return;
    }
    await deps.reinject(tabId);
  };
}
