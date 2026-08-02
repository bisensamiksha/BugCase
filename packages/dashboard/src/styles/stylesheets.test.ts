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

describe('print.css', () => {
  it('scopes everything to @media print', async () => {
    const css = await read('print.css');
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    // Any rule outside the print block would leak into the on-screen dashboard.
    expect(withoutComments.trim().startsWith('@media print')).toBe(true);
  });

  it('hides chrome and reveals print-only content', async () => {
    const css = await read('print.css');
    expect(css).toContain('[data-print-hide]');
    expect(css).toContain('display: none !important');
    expect(css).toContain('[data-print-only]');
    expect(css).toContain('display: block !important');
  });

  it('forces the light token values regardless of the resolved theme', async () => {
    const css = await read('print.css');
    // Printing a dark page wastes ink; the data-theme attribute is deliberately overridden.
    expect(css).toContain(":root[data-theme='dark']");
    expect(css).toContain('--bc-bg: #ffffff');
    expect(css).toContain('--bc-fg: #0f172a');
  });

  it('unclamps scroll containers so nothing is cut at the fold', async () => {
    const css = await read('print.css');
    expect(css).toContain('max-height: none !important');
    expect(css).toContain('overflow: visible !important');
  });

  it('avoids breaking rows across pages', async () => {
    expect(await read('print.css')).toContain('break-inside: avoid');
  });
});
