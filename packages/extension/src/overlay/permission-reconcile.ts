/**
 * Reconcile capture options against the optional permissions actually granted.
 *
 * `CaptureOptions.handleToggle` refuses to switch on a gated option without its permission, so
 * "ticked implies granted" holds at the moment the user ticks — but nothing re-checks it afterwards.
 * A permission granted, ticked in Settings and later revoked in the popup leaves a stored `true`, and
 * every later overlay seeds that straight into state without a check (as does a restored BUG-06
 * draft). The capture then silently omits the data the ticked box promised.
 *
 * Pure — no React, no browser — so the rule is unit-testable and the Settings page can simply not
 * apply it (see the design doc: Settings records intent, the overlay reflects reality).
 */

import type { UserOptions } from '@bugcase/schema';

import type { OptionalPermissionName } from '../permissions/optional-permissions';

import { optionPermission, type CaptureOptionKey } from './capture-options-state';

/** Gated options that are switched ON but whose permission is not granted. */
export function blockedGatedOptions(
  options: UserOptions,
  granted: ReadonlySet<OptionalPermissionName>,
): readonly CaptureOptionKey[] {
  return (Object.keys(options) as CaptureOptionKey[]).filter((key) => {
    if (options[key] !== true) {
      return false;
    }
    const permission = optionPermission(key);
    return permission !== undefined && !granted.has(permission);
  });
}

/**
 * The same options with every blocked gated option switched off.
 *
 * Returns the input object itself when nothing is blocked. Callers rely on that reference identity to
 * skip a needless state update — returning a fresh object unconditionally would loop a React effect
 * that reconciles on every change.
 */
export function reconcileOptionsToGrants(
  options: UserOptions,
  granted: ReadonlySet<OptionalPermissionName>,
): UserOptions {
  const blocked = blockedGatedOptions(options, granted);
  if (blocked.length === 0) {
    return options;
  }
  const next = { ...options };
  for (const key of blocked) {
    next[key] = false;
  }
  return next;
}
