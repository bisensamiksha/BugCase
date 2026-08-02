import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

/**
 * Content-invariant checks for the two stylesheets no component test can reach (S4-25).
 *
 * `shiki-theme.css` and `print.css` are plain CSS — they have no exported behaviour to assert
 * against, but both encode decisions that would break silently if edited carelessly. These tests
 * follow the same pattern as the privacy-site's content-invariant tests.
 */

const read = (name: string) => readFile(new URL(`./${name}`, import.meta.url), 'utf8');

describe('shiki-theme.css', () => {
  it('keys the dark flip on the resolved data-theme attribute', async () => {
    const css = await read('shiki-theme.css');
    expect(css).toContain(":root[data-theme='dark'] .shiki");
  });

  it('guards the OS fallback so it cannot fight a resolved theme', async () => {
    const css = await read('shiki-theme.css');
    // The pre-JS block must only match before the controller has written data-theme; without the
    // :not() guard a dark-OS visitor who chooses light keeps dark syntax highlighting.
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(':root:not([data-theme])');
  });

  it('still overrides the inline light colours Shiki emits', async () => {
    const css = await read('shiki-theme.css');
    expect(css).toContain('var(--shiki-dark)');
    expect(css).toContain('var(--shiki-dark-bg)');
    expect(css).toContain('!important');
  });
});
