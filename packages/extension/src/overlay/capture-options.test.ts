import type { UserOptions } from '@bugcase/schema';
import { describe, expect, it } from 'vitest';

import { DEFAULT_USER_OPTIONS } from '../capture/metadata';

import {
  CAPTURE_OPTION_DEFAULTS,
  CAPTURE_OPTION_GROUPS,
  GATED_PERMISSIONS,
  captureOptionsReducer,
  optionLabel,
  optionPermission,
} from './capture-options-state';

describe('capture options defaults', () => {
  it('uses the metadata collector defaults verbatim', () => {
    expect(CAPTURE_OPTION_DEFAULTS).toEqual(DEFAULT_USER_OPTIONS);
    expect(CAPTURE_OPTION_DEFAULTS.viewportScreenshot).toBe(true);
    expect(CAPTURE_OPTION_DEFAULTS.screenInfo).toBe(true);
    expect(CAPTURE_OPTION_DEFAULTS.cookies).toBe(false);
  });
});

describe('CAPTURE_OPTION_GROUPS', () => {
  it('covers every UserOptions key exactly once', () => {
    const keys = CAPTURE_OPTION_GROUPS.flatMap((g) => g.options.map((o) => o.key)).sort();
    const expected = (Object.keys(DEFAULT_USER_OPTIONS) as (keyof UserOptions)[]).sort();
    expect(keys).toEqual(expected);
  });
});

describe('captureOptionsReducer', () => {
  it('toggles a key without mutating the input', () => {
    const next = captureOptionsReducer(DEFAULT_USER_OPTIONS, {
      type: 'toggle',
      key: 'domSnapshot',
    });
    expect(next.domSnapshot).toBe(true);
    expect(DEFAULT_USER_OPTIONS.domSnapshot).toBe(false);
  });

  it('sets a key to an explicit value', () => {
    const on = captureOptionsReducer(DEFAULT_USER_OPTIONS, {
      type: 'set',
      key: 'cookies',
      value: true,
    });
    expect(on.cookies).toBe(true);
    const off = captureOptionsReducer(on, { type: 'set', key: 'cookies', value: false });
    expect(off.cookies).toBe(false);
  });

  it('resets to defaults', () => {
    const dirty = captureOptionsReducer(DEFAULT_USER_OPTIONS, {
      type: 'set',
      key: 'fullPageScreenshot',
      value: true,
    });
    expect(captureOptionsReducer(dirty, { type: 'reset' })).toEqual(DEFAULT_USER_OPTIONS);
  });

  it('screenshot options are single-select: choosing one clears the other (BUG-03)', () => {
    // Default is Visible area on. Choosing Full page turns Visible area off.
    const full = captureOptionsReducer(DEFAULT_USER_OPTIONS, {
      type: 'set',
      key: 'fullPageScreenshot',
      value: true,
    });
    expect(full.fullPageScreenshot).toBe(true);
    expect(full.viewportScreenshot).toBe(false);

    // Choosing Visible area again turns Full page off.
    const back = captureOptionsReducer(full, {
      type: 'set',
      key: 'viewportScreenshot',
      value: true,
    });
    expect(back.viewportScreenshot).toBe(true);
    expect(back.fullPageScreenshot).toBe(false);
  });

  it('screenshot options keep exactly one selected — deselecting the active one is ignored (BUG-03)', () => {
    // A screenshot is always captured, so the mode is a one-of choice; unticking the only selected
    // one must not leave both off.
    const next = captureOptionsReducer(DEFAULT_USER_OPTIONS, {
      type: 'set',
      key: 'viewportScreenshot',
      value: false,
    });
    expect(next.viewportScreenshot).toBe(true);
    expect(next.fullPageScreenshot).toBe(false);
  });

  it('single-select does not affect non-screenshot options', () => {
    const next = captureOptionsReducer(DEFAULT_USER_OPTIONS, {
      type: 'set',
      key: 'localStorage',
      value: true,
    });
    expect(next.localStorage).toBe(true);
    expect(next.viewportScreenshot).toBe(true);
  });
});

describe('optionPermission', () => {
  it('maps the three gated options and nothing else', () => {
    expect(optionPermission('cookies')).toBe('cookies');
    expect(optionPermission('installedExtensions')).toBe('management');
    expect(optionPermission('navigationHistory')).toBe('history');
    expect(optionPermission('domSnapshot')).toBeUndefined();
    expect(optionPermission('viewportScreenshot')).toBeUndefined();
  });
});

describe('GATED_PERMISSIONS', () => {
  it('is exactly the permissions the option metadata gates on, with no duplicates', () => {
    expect([...GATED_PERMISSIONS].sort()).toEqual(['cookies', 'history', 'management']);
    expect(new Set(GATED_PERMISSIONS).size).toBe(GATED_PERMISSIONS.length);
  });

  it('covers every permission named in CAPTURE_OPTION_GROUPS', () => {
    // The point of deriving it: a gated option added to the metadata but missing from this list
    // would never be checked, would read as ungranted forever, and the overlay would permanently
    // untick it — a silent report reduction.
    for (const group of CAPTURE_OPTION_GROUPS) {
      for (const option of group.options) {
        if (option.permission) {
          expect(GATED_PERMISSIONS).toContain(option.permission);
        }
      }
    }
  });
});

describe('optionLabel', () => {
  it('returns the display label for a known option', () => {
    expect(optionLabel('cookies')).toBe('Cookies');
    expect(optionLabel('navigationHistory')).toBe('Navigation history');
    expect(optionLabel('installedExtensions')).toBe('Installed extensions');
  });
});
