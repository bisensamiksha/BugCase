/**
 * Capture-options state (S2-20).
 *
 * The pure core behind the overlay's grouped checkbox UI: the correct defaults (re-exported from the
 * metadata collector so they never drift), the grouped option metadata the UI renders, a pure
 * reducer, and the option → optional-permission lookup. No React, no browser — unit-testable in
 * isolation.
 */

import type { UserOptions } from '@bugcase/schema';

import { DEFAULT_USER_OPTIONS } from '../capture/metadata';
import type { OptionalPermissionName } from '../permissions/optional-permissions';

export type CaptureOptionKey = keyof UserOptions;

/** Correct capture defaults — the single source of truth lives in the metadata collector. */
export const CAPTURE_OPTION_DEFAULTS: UserOptions = DEFAULT_USER_OPTIONS;

export interface CaptureOptionDef {
  readonly key: CaptureOptionKey;
  readonly label: string;
  /** Present only for options that require an optional browser permission. */
  readonly permission?: OptionalPermissionName;
}

export interface CaptureOptionGroup {
  readonly id: string;
  readonly label: string;
  readonly options: readonly CaptureOptionDef[];
}

/** Every capture option, grouped for display. Covers each UserOptions key exactly once. */
export const CAPTURE_OPTION_GROUPS: readonly CaptureOptionGroup[] = [
  {
    id: 'screenshot',
    label: 'Screenshot',
    options: [
      { key: 'viewportScreenshot', label: 'Visible area' },
      { key: 'fullPageScreenshot', label: 'Full page' },
    ],
  },
  {
    id: 'page',
    label: 'Page',
    options: [
      { key: 'domSnapshot', label: 'DOM snapshot' },
      { key: 'screenInfo', label: 'Screen & zoom' },
      { key: 'browserInfo', label: 'Browser info' },
    ],
  },
  {
    id: 'activity',
    label: 'Activity',
    options: [
      { key: 'consoleLogs', label: 'Console logs' },
      { key: 'networkLog', label: 'Network log' },
      { key: 'navigationHistory', label: 'Navigation history', permission: 'history' },
    ],
  },
  {
    id: 'storage',
    label: 'Storage & cookies',
    options: [
      { key: 'cookies', label: 'Cookies', permission: 'cookies' },
      { key: 'localStorage', label: 'Local storage' },
      { key: 'sessionStorage', label: 'Session storage' },
    ],
  },
  {
    id: 'extensions',
    label: 'Extensions',
    options: [
      { key: 'installedExtensions', label: 'Installed extensions', permission: 'management' },
    ],
  },
  {
    id: 'reproduction',
    label: 'Reproduction',
    options: [
      { key: 'reproductionSteps', label: 'Reproduction steps' },
      { key: 'elementInspections', label: 'Element inspections' },
    ],
  },
];

export type CaptureOptionsAction =
  | { readonly type: 'toggle'; readonly key: CaptureOptionKey }
  | { readonly type: 'set'; readonly key: CaptureOptionKey; readonly value: boolean }
  | { readonly type: 'reset' };

/**
 * Single-select groups (BUG-03): choosing one option clears the others in the same group. A screenshot
 * is always captured, so "Visible area" vs "Full page" is a one-of choice, not two independent toggles.
 */
const MUTEX_GROUPS: readonly (readonly CaptureOptionKey[])[] = [
  ['viewportScreenshot', 'fullPageScreenshot'],
];

/** The keys a given option is mutually exclusive with (empty for ordinary, independent options). */
function mutexSiblings(key: CaptureOptionKey): readonly CaptureOptionKey[] {
  const group = MUTEX_GROUPS.find((g) => g.includes(key));
  return group ? group.filter((k) => k !== key) : [];
}

/** Pure reducer over the capture options; never mutates `state`. */
export function captureOptionsReducer(
  state: UserOptions,
  action: CaptureOptionsAction,
): UserOptions {
  switch (action.type) {
    case 'toggle':
      return { ...state, [action.key]: !state[action.key] };
    case 'set': {
      const siblings = mutexSiblings(action.key);
      if (siblings.length > 0) {
        if (action.value) {
          // Selecting one in a single-select group turns its siblings off.
          return siblings.reduce<UserOptions>((acc, sibling) => ({ ...acc, [sibling]: false }), {
            ...state,
            [action.key]: true,
          });
        }
        // Keep exactly one selected: ignore a deselect that would leave the whole group off.
        if (siblings.every((sibling) => !state[sibling])) {
          return state;
        }
      }
      return { ...state, [action.key]: action.value };
    }
    case 'reset':
      return CAPTURE_OPTION_DEFAULTS;
  }
}

const PERMISSION_BY_KEY: ReadonlyMap<CaptureOptionKey, OptionalPermissionName> = new Map(
  CAPTURE_OPTION_GROUPS.flatMap((group) =>
    group.options.flatMap((option) =>
      option.permission === undefined ? [] : [[option.key, option.permission] as const],
    ),
  ),
);

/** The optional permission a given option requires, if any. */
export function optionPermission(key: CaptureOptionKey): OptionalPermissionName | undefined {
  return PERMISSION_BY_KEY.get(key);
}

const LABEL_BY_KEY: ReadonlyMap<CaptureOptionKey, string> = new Map(
  CAPTURE_OPTION_GROUPS.flatMap((group) =>
    group.options.map((option) => [option.key, option.label] as const),
  ),
);

/** Display label for a capture option (e.g. `cookies` → `Cookies`); the key itself if unknown. */
export function optionLabel(key: CaptureOptionKey): string {
  return LABEL_BY_KEY.get(key) ?? key;
}
