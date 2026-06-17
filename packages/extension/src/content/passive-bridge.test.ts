// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { PASSIVE_BRIDGE_INSTALLED_FLAG, installPassiveBridge } from './passive-bridge';

describe('installPassiveBridge', () => {
  beforeEach(() => {
    // The module self-invokes on import (it ships as an injected IIFE), so reset the guard flag.
    delete (window as unknown as Record<string, unknown>)[PASSIVE_BRIDGE_INSTALLED_FLAG];
  });

  it('installs once and marks the isolated-world flag', () => {
    expect(installPassiveBridge(window)).toBe(true);
    expect((window as unknown as Record<string, unknown>)[PASSIVE_BRIDGE_INSTALLED_FLAG]).toBe(
      true,
    );
  });

  it('is idempotent — a second install on the same window is a no-op', () => {
    expect(installPassiveBridge(window)).toBe(true);
    expect(installPassiveBridge(window)).toBe(false);
  });

  it('does not throw when invoked', () => {
    expect(() => installPassiveBridge(window)).not.toThrow();
  });
});
