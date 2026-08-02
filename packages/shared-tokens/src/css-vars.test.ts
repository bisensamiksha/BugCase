import { describe, expect, it } from 'vitest';

import { CSS_VAR_NAME, emitTokensCss } from './css-vars';
import { darkTheme, lightTheme } from './themes';

describe('CSS custom-property emission', () => {
  it('names every token with a --bc- prefix', () => {
    for (const [token, name] of Object.entries(CSS_VAR_NAME)) {
      expect(name, token).toMatch(/^--bc-[a-z0-9-]+$/);
    }
  });

  it('covers every token in both themes', () => {
    const named = Object.keys(CSS_VAR_NAME).sort();
    expect(Object.keys(lightTheme).sort()).toEqual(named);
    expect(Object.keys(darkTheme).sort()).toEqual(named);
  });

  it('emits a declaration for every token', () => {
    const css = emitTokensCss();
    for (const name of Object.values(CSS_VAR_NAME)) {
      expect(css, name).toContain(`${name}:`);
    }
  });

  it('scopes the OS-preference fallback so an explicit light choice wins', () => {
    const css = emitTokensCss();
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(":root:not([data-theme='light'])");
  });

  it('emits an explicit dark block keyed on the resolved attribute', () => {
    expect(emitTokensCss()).toContain(":root[data-theme='dark']");
  });

  it('resolves light and dark to different values where the themes differ', () => {
    const css = emitTokensCss();
    expect(css).toContain(`--bc-bg: ${lightTheme.bg};`);
    expect(css).toContain(`--bc-bg: ${darkTheme.bg};`);
    expect(lightTheme.bg).not.toBe(darkTheme.bg);
  });

  // Regenerate with `pnpm --filter @bugcase/shared-tokens generate`.
  it('matches the committed tokens.css', async () => {
    await expect(emitTokensCss()).toMatchFileSnapshot('./tokens.css');
  });
});
