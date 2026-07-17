/**
 * Lazy Shiki highlighter for the DOM pane's source view (S4-09). Everything Shiki — core, the JS
 * regex engine, the HTML grammar, both themes — is loaded through dynamic imports inside the first
 * `highlightHtml` call, so Vite splits it into its own async chunk that only downloads when a
 * Source tab actually needs highlighting (the S4-05 open-budget never pays for it). The highlighter
 * is memoized: one instance serves every call for the session.
 */

import type { HighlighterCore } from 'shiki/core';

/**
 * Snapshots longer than this render as plain text instead of tokenized markup — grammar-based
 * highlighting of a multi-megabyte page would block the main thread for seconds.
 */
export const HIGHLIGHT_MAX_CHARS = 500_000;

export type HighlightResult =
  | { readonly kind: 'highlighted'; readonly html: string }
  | { readonly kind: 'plain'; readonly reason: 'too-large' };

let highlighterPromise: Promise<HighlighterCore> | null = null;

function loadHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, light, dark, html] =
      await Promise.all([
        import('shiki/core'),
        import('shiki/engine/javascript'),
        import('shiki/themes/github-light.mjs'),
        import('shiki/themes/github-dark.mjs'),
        import('shiki/langs/html.mjs'),
      ]);
    return createHighlighterCore({
      themes: [light.default, dark.default],
      langs: [html.default],
      engine: createJavaScriptRegexEngine(),
    });
  })();
  return highlighterPromise;
}

/**
 * Highlight raw snapshot HTML for display. The output escapes every character of the input (Shiki
 * emits text nodes only inside its token spans), so captured markup is never injected live. Emits
 * dual-theme CSS variables (`--shiki-dark`); `index.css` applies them under dark mode.
 */
export async function highlightHtml(source: string): Promise<HighlightResult> {
  if (source.length > HIGHLIGHT_MAX_CHARS) {
    return { kind: 'plain', reason: 'too-large' };
  }
  const highlighter = await loadHighlighter();
  const html = highlighter.codeToHtml(source, {
    lang: 'html',
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: 'light',
  });
  return { kind: 'highlighted', html };
}
