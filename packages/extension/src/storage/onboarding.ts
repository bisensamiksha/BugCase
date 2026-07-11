/**
 * First-install onboarding seen-state (S3-18).
 *
 * A single boolean in `chrome.storage.local` marking that the first-run tour has been completed or
 * skipped, so it is shown once and never again. Defensive, mirroring settings/report-history: a missing
 * or malformed value reads as "not seen", and neither read nor write ever throws.
 */

import browser from '../lib/browser';

import type { SettingsStorageArea } from './settings';

/** The storage surface this module needs (get/set); reuses the settings area shape. */
export type OnboardingStorageArea = SettingsStorageArea;

/** `chrome.storage.local` key holding the onboarding seen flag. */
export const ONBOARDING_SEEN_KEY = 'bugcase/onboarding-seen';

export interface OnboardingDeps {
  /** Defaults to `browser.storage.local`; injected in tests. */
  readonly storage?: OnboardingStorageArea;
}

function area(deps: OnboardingDeps): OnboardingStorageArea {
  return deps.storage ?? browser.storage.local;
}

/** Whether the first-install tour has been completed or skipped. `false` on missing/malformed/error. */
export async function getOnboardingSeen(deps: OnboardingDeps = {}): Promise<boolean> {
  try {
    const record = await area(deps).get(ONBOARDING_SEEN_KEY);
    return record[ONBOARDING_SEEN_KEY] === true;
  } catch {
    return false;
  }
}

/** Persist the onboarding seen flag. Best-effort — a write failure never throws. */
export async function setOnboardingSeen(seen: boolean, deps: OnboardingDeps = {}): Promise<void> {
  try {
    await area(deps).set({ [ONBOARDING_SEEN_KEY]: seen });
  } catch {
    // best-effort: persisting the flag must never break the onboarding UX
  }
}
