import { describe, expect, it } from 'vitest';

import { CAPTURE_OPTION_DEFAULTS } from './capture-options-state';
import {
  blockedGatedOptions,
  reconcileOptionsToGrants,
  samePermissionSet,
} from './permission-reconcile';

const NONE = new Set<'cookies' | 'management' | 'history'>();
const ALL = new Set<'cookies' | 'management' | 'history'>(['cookies', 'management', 'history']);
/**
 * Only `history` granted. All-or-nothing sets can't tell the three permissions apart: swapping
 * `management` and `history` anywhere in the mapping would pass every test built on NONE/ALL.
 */
const ONLY_HISTORY = new Set<'cookies' | 'management' | 'history'>(['history']);

describe('blockedGatedOptions', () => {
  it('lists a gated option that is on without its permission', () => {
    const options = { ...CAPTURE_OPTION_DEFAULTS, cookies: true };
    expect(blockedGatedOptions(options, NONE)).toEqual(['cookies']);
  });

  it('lists every gated option that is on without its permission', () => {
    const options = {
      ...CAPTURE_OPTION_DEFAULTS,
      cookies: true,
      installedExtensions: true,
      navigationHistory: true,
    };
    expect([...blockedGatedOptions(options, NONE)].sort()).toEqual(
      ['cookies', 'installedExtensions', 'navigationHistory'].sort(),
    );
  });

  it('does not list a gated option whose permission is granted', () => {
    const options = { ...CAPTURE_OPTION_DEFAULTS, cookies: true };
    expect(blockedGatedOptions(options, ALL)).toEqual([]);
  });

  it('does not list a gated option that is already off', () => {
    const options = { ...CAPTURE_OPTION_DEFAULTS, cookies: false };
    expect(blockedGatedOptions(options, NONE)).toEqual([]);
  });

  it('never lists a non-gated option, whatever the grant set', () => {
    const options = { ...CAPTURE_OPTION_DEFAULTS, consoleLogs: true, domSnapshot: true };
    expect(blockedGatedOptions(options, NONE)).toEqual([]);
  });

  it('blocks exactly the options whose own permission is missing, on a mixed grant set', () => {
    const options = {
      ...CAPTURE_OPTION_DEFAULTS,
      cookies: true,
      installedExtensions: true,
      navigationHistory: true,
    };
    expect([...blockedGatedOptions(options, ONLY_HISTORY)].sort()).toEqual(
      ['cookies', 'installedExtensions'].sort(),
    );
  });
});

describe('reconcileOptionsToGrants', () => {
  it('switches off a gated option whose permission is missing', () => {
    const options = { ...CAPTURE_OPTION_DEFAULTS, cookies: true };
    expect(reconcileOptionsToGrants(options, NONE).cookies).toBe(false);
  });

  it('leaves a gated option on when its permission is granted', () => {
    const options = { ...CAPTURE_OPTION_DEFAULTS, cookies: true };
    expect(reconcileOptionsToGrants(options, ALL).cookies).toBe(true);
  });

  it('leaves non-gated options untouched', () => {
    const options = { ...CAPTURE_OPTION_DEFAULTS, consoleLogs: true, cookies: true };
    const next = reconcileOptionsToGrants(options, NONE);
    expect(next.consoleLogs).toBe(true);
    expect(next.cookies).toBe(false);
  });

  it('returns the SAME object reference when nothing is blocked', () => {
    const options = { ...CAPTURE_OPTION_DEFAULTS, consoleLogs: true };
    expect(reconcileOptionsToGrants(options, NONE)).toBe(options);
  });

  it('does not mutate the input', () => {
    const options = { ...CAPTURE_OPTION_DEFAULTS, cookies: true };
    reconcileOptionsToGrants(options, NONE);
    expect(options.cookies).toBe(true);
  });

  it('switches off only the options whose own permission is missing, on a mixed grant set', () => {
    const options = {
      ...CAPTURE_OPTION_DEFAULTS,
      cookies: true,
      installedExtensions: true,
      navigationHistory: true,
    };
    const next = reconcileOptionsToGrants(options, ONLY_HISTORY);
    expect(next.navigationHistory).toBe(true);
    expect(next.cookies).toBe(false);
    expect(next.installedExtensions).toBe(false);
  });
});

describe('samePermissionSet', () => {
  it('is true for equal membership regardless of insertion order', () => {
    expect(
      samePermissionSet(new Set(['cookies', 'history']), new Set(['history', 'cookies'])),
    ).toBe(true);
    expect(samePermissionSet(NONE, new Set())).toBe(true);
  });

  it('is false when either set holds a permission the other does not', () => {
    expect(samePermissionSet(ONLY_HISTORY, new Set(['cookies']))).toBe(false);
    expect(samePermissionSet(ONLY_HISTORY, ALL)).toBe(false);
    expect(samePermissionSet(ALL, ONLY_HISTORY)).toBe(false);
  });
});
