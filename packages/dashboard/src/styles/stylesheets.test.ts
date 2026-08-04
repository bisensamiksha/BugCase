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

  it('suppresses the on-screen focus ring so nothing prints a stray outline (S4-27)', async () => {
    const css = await read('print.css');
    // A focus ring belongs to on-screen keyboard navigation; paper has no keyboard to navigate
    // with. Cancels both index.css rules — the general :focus-visible ring and #main's plain
    // :focus ring — using the same selectors so source order (print.css loads after index.css,
    // see main.tsx) settles any specificity tie.
    expect(css).toContain(':focus-visible');
    expect(css).toContain('#main:focus');
    expect(css).toContain('outline: none');
  });
});

describe('index.css', () => {
  it('defines a token-based focus ring for keyboard users only', async () => {
    const css = await read('../index.css');

    // `:focus-visible`, not `:focus` — a mouse click on an ordinary control must not leave a ring
    // behind. (#main is a deliberate, separately-tested exception below.)
    expect(css).toContain(':focus-visible');
    expect(css).toContain('var(--bc-accent)');
    // An offset ring in the page colour keeps the indicator visible on accent-filled surfaces too.
    expect(css).toContain('var(--bc-bg)');
  });

  it('does not animate the focus ring', async () => {
    const css = await read('../index.css');
    const rule = css.slice(css.indexOf(':focus-visible'));

    // No transition means nothing to disable under prefers-reduced-motion.
    expect(rule).not.toContain('transition');
  });

  it('excludes sr-only elements from the global rule rather than implying they are covered', async () => {
    const css = await read('../index.css');

    // `sr-only` sets `clip: rect(0, 0, 0, 0)`, which clips an element's entire paint region —
    // outline and box-shadow included — so a `:focus-visible` rule that matched `.sr-only` would be
    // silent dead code, and worse, would read as though sr-only controls were handled here. They
    // are not: DropZone.tsx's sr-only file input solves its own indicator via `peer` on the input
    // plus `peer-focus-visible:` on the adjacent visible label instead. This only proves the
    // exclusion is written into the selector — whether the ring actually renders anywhere is the
    // Task 15 Playwright gate, not this text-only test.
    expect(css).toContain(':focus-visible:not(.sr-only)');
  });

  it('gives #main an indicator that does not depend on the focus-visible heuristic matching', async () => {
    const css = await read('../index.css');

    // #main (AppShell.tsx) carries tabIndex={-1} and is reached only programmatically — the skip
    // link (SkipLink.tsx) and useRouteFocus (a11y/focus.ts) both call `.focus()` directly, never via
    // Tab — so it is the one place a sighted keyboard user most needs confirmation that focus moved,
    // and the one place `:focus-visible`'s cross-browser handling of scripted, effect-deferred
    // focus is least predictable. #main also gets a plain `:focus` rule so the ring does not depend
    // on that heuristic resolving one way or another in every browser. Whether `:focus-visible`
    // alone would already have been enough on a given browser is a Task 15 Playwright question, not
    // this one — this test only proves the rule exists with the right tokens.
    expect(css).toContain('#main:focus');
    const rule = css.slice(css.indexOf('#main:focus'));
    expect(rule).toContain('var(--bc-accent)');
    expect(rule).toContain('var(--bc-bg)');
  });
});
