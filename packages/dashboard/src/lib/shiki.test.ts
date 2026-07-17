import { describe, expect, it } from 'vitest';

import { HIGHLIGHT_MAX_CHARS, highlightHtml } from './shiki';

describe('highlightHtml', () => {
  it('highlights small HTML into escaped, tokenized markup with dual-theme CSS vars', async () => {
    const result = await highlightHtml('<div id="app">hi &amp; bye</div>');
    expect(result.kind).toBe('highlighted');
    if (result.kind !== 'highlighted') {
      return;
    }
    // Tokenized output…
    expect(result.html).toContain('<pre');
    expect(result.html).toContain('shiki');
    expect(result.html).toContain('<span');
    // …with every piece of captured markup escaped (Shiki emits hex entities), never live.
    expect(result.html).toContain('&#x3C;');
    expect(result.html).not.toContain('<div');
    // Dual light/dark themes emit CSS variables for the dark values (index.css flips them).
    expect(result.html).toContain('--shiki-dark');
  });

  it('falls back to plain text above the size cap so huge snapshots cannot freeze the tab', async () => {
    const huge = '<p>'.repeat(Math.ceil(HIGHLIGHT_MAX_CHARS / 3) + 1);
    const result = await highlightHtml(huge);
    expect(result).toEqual({ kind: 'plain', reason: 'too-large' });
  });

  it('serves repeat calls (memoized highlighter) with consistent output', async () => {
    const first = await highlightHtml('<b>x</b>');
    const second = await highlightHtml('<b>x</b>');
    expect(first).toEqual(second);
    expect(first.kind).toBe('highlighted');
  });
});
