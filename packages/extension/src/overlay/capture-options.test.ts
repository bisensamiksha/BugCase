import type { UserOptions } from '@bugcase/schema';
import { describe, expect, it } from 'vitest';

import { DEFAULT_USER_OPTIONS } from '../capture/metadata';

import {
  CAPTURE_OPTION_DEFAULTS,
  CAPTURE_OPTION_GROUPS,
  captureOptionsReducer,
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
