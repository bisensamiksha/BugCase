/**
 * Passive error detection badge controller (S3-14).
 *
 * On allowlisted origins the page relays each uncaught error to the worker; this tracks a per-tab
 * count and reflects it on the toolbar icon (`action.setBadgeText`, capped `9+`, red). Cleared on
 * capture, on explicit dismiss, and on navigation. Best-effort: a missing/failed `action` API never
 * throws (the count still tracks). The storage + action are injectable, so it's unit-tested without a
 * real browser.
 */

import browser from '../lib/browser';
import {
  clearPassiveErrorCount,
  getPassiveErrorCount,
  incrementPassiveErrorCount,
  type PassiveErrorsDeps,
} from '../storage/passive-errors';

/** Red badge background (Tailwind red-600). */
export const BADGE_BACKGROUND = '#dc2626';

/** The slice of `chrome.action` we depend on (promise- or callback-style via the polyfill). */
export interface BadgeAction {
  setBadgeText(details: { text: string; tabId?: number }): Promise<void> | void;
  setBadgeBackgroundColor?(details: { color: string; tabId?: number }): Promise<void> | void;
}

export interface PassiveErrorBadgeDeps extends PassiveErrorsDeps {
  /** Defaults to `browser.action`; injected in tests. */
  readonly action?: BadgeAction;
}

/** Badge text for a count: empty at zero, the number up to 9, then `9+`. */
export function badgeText(count: number): string {
  if (count <= 0) {
    return '';
  }
  return count > 9 ? '9+' : String(count);
}

function resolveAction(deps: PassiveErrorBadgeDeps): BadgeAction | undefined {
  return deps.action ?? (browser as unknown as { action?: BadgeAction }).action;
}

async function setBadge(
  action: BadgeAction | undefined,
  tabId: number,
  text: string,
): Promise<void> {
  if (!action) {
    return;
  }
  try {
    await action.setBadgeText({ text, tabId });
    if (text !== '' && action.setBadgeBackgroundColor) {
      await action.setBadgeBackgroundColor({ color: BADGE_BACKGROUND, tabId });
    }
  } catch {
    // Best-effort: reflecting the badge must never break error handling.
  }
}

/** Record one passive error for a tab and update its badge. Returns the new count. */
export async function recordPassiveError(
  tabId: number | undefined,
  deps: PassiveErrorBadgeDeps = {},
): Promise<number> {
  if (tabId === undefined) {
    return 0;
  }
  const count = await incrementPassiveErrorCount(tabId, deps);
  await setBadge(resolveAction(deps), tabId, badgeText(count));
  return count;
}

/** Clear a tab's passive error count + badge (on capture, dismiss, or navigation). */
export async function clearPassiveErrorBadge(
  tabId: number | undefined,
  deps: PassiveErrorBadgeDeps = {},
): Promise<void> {
  if (tabId === undefined) {
    return;
  }
  await clearPassiveErrorCount(tabId, deps);
  await setBadge(resolveAction(deps), tabId, '');
}

export { getPassiveErrorCount };
