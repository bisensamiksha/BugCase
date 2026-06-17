// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { PASSIVE_MAIN_INSTALLED_FLAG, installPassiveMainWorld } from './main-entry';

describe('installPassiveMainWorld', () => {
  beforeEach(() => {
    // The module self-invokes on import (it ships as an injected IIFE), so reset the guard flag.
    delete (window as unknown as Record<string, unknown>)[PASSIVE_MAIN_INSTALLED_FLAG];
  });

  it('installs once and marks the page-world flag', () => {
    expect(installPassiveMainWorld(window)).toBe(true);
    expect((window as unknown as Record<string, unknown>)[PASSIVE_MAIN_INSTALLED_FLAG]).toBe(true);
  });

  it('is idempotent — a second install on the same window is a no-op', () => {
    expect(installPassiveMainWorld(window)).toBe(true);
    expect(installPassiveMainWorld(window)).toBe(false);
  });

  it('does not throw when invoked', () => {
    expect(() => installPassiveMainWorld(window)).not.toThrow();
  });
});
