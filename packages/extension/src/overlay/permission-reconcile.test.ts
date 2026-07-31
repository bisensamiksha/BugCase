import { describe, expect, it } from 'vitest';

import { CAPTURE_OPTION_DEFAULTS } from './capture-options-state';
import { blockedGatedOptions, reconcileOptionsToGrants } from './permission-reconcile';

const NONE = new Set<'cookies' | 'management' | 'history'>();
const ALL = new Set<'cookies' | 'management' | 'history'>(['cookies', 'management', 'history']);

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
});
