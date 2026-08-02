import { describe, expect, it } from 'vitest';

import { palette } from './primitives';
import { darkTheme, lightTheme, type ThemeTokens } from './themes';

describe('theme tokens', () => {
  it('exposes identical key sets for light and dark', () => {
    expect(Object.keys(lightTheme).sort()).toEqual(Object.keys(darkTheme).sort());
  });

  it('defines every colour as a primitive reference, never a fresh literal', () => {
    const primitives = new Set<string>(Object.values(palette));

    for (const [themeName, theme] of Object.entries({ lightTheme, darkTheme })) {
      for (const [token, value] of Object.entries(theme)) {
        expect(
          primitives,
          `${themeName}.${token} = ${value} is not in the primitive scale`,
        ).toContain(value);
      }
    }
  });

  it('uses lowercase six-digit hex throughout the primitive scale', () => {
    for (const [name, value] of Object.entries(palette)) {
      expect(value, name).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('keeps the primitive scale free of duplicate values', () => {
    const seen = new Map<string, string>();
    for (const [name, value] of Object.entries(palette)) {
      const existing = seen.get(value);
      expect(existing, `${name} duplicates ${String(existing)} (${value})`).toBeUndefined();
      seen.set(value, name);
    }
  });

  it('types the two themes identically', () => {
    // Compile-time assertion: both themes satisfy the same contract.
    const themes: ThemeTokens[] = [lightTheme, darkTheme];
    expect(themes).toHaveLength(2);
  });
});
