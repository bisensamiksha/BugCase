// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { computeStableSelector } from './selector';

afterEach(() => {
  document.body.innerHTML = '';
});

/** Mount HTML into the document body and return the first element matching `pick`. */
function mount(html: string, pick: string): Element {
  document.body.innerHTML = html;
  const el = document.body.querySelector(pick);
  if (!el) {
    throw new Error(`test fixture missing element: ${pick}`);
  }
  return el;
}

describe('computeStableSelector', () => {
  it('prefers a unique id', () => {
    const el = mount('<button id="save">Save</button>', '#save');
    expect(computeStableSelector(el)).toBe('#save');
  });

  it('falls through an id that is not unique on the page', () => {
    // Two elements share id="dup" (invalid but real); #dup would be ambiguous, so skip it.
    const el = mount('<div id="dup"></div><button id="dup">x</button>', 'button');
    const selector = computeStableSelector(el);
    expect(selector).not.toBe('#dup');
    expect(document.querySelectorAll(selector)).toHaveLength(1);
    expect(document.querySelector(selector)).toBe(el);
  });

  it('prefers data-testid over a CSS path when there is no id', () => {
    const el = mount('<div><span data-testid="submit">go</span></div>', 'span');
    expect(computeStableSelector(el)).toBe('[data-testid="submit"]');
  });

  it('uses another data-* attribute when there is no id or data-testid', () => {
    const el = mount('<a data-qa="link-1">go</a>', 'a');
    expect(computeStableSelector(el)).toBe('[data-qa="link-1"]');
  });

  it('uses role + aria-label as an accessible-name selector', () => {
    const el = mount('<div role="button" aria-label="Close dialog">x</div>', 'div');
    expect(computeStableSelector(el)).toBe('[role="button"][aria-label="Close dialog"]');
  });

  it('falls back to a nth-of-type CSS path when nothing stable is present', () => {
    const el = mount('<nav><a>home</a><a>about</a><a>contact</a></nav>', 'nav > a:nth-of-type(2)');
    const selector = computeStableSelector(el);
    expect(selector).toContain(':nth-of-type(2)');
    expect(document.querySelector(selector)).toBe(el);
  });

  it('anchors the CSS path at the nearest id-bearing ancestor', () => {
    const el = mount(
      '<section id="main"><ul><li>a</li><li>b</li></ul></section>',
      'li:nth-of-type(2)',
    );
    const selector = computeStableSelector(el);
    expect(selector.startsWith('#main')).toBe(true);
    expect(document.querySelector(selector)).toBe(el);
  });

  it('caps path depth so deeply nested elements do not produce an unbounded selector', () => {
    document.body.innerHTML =
      '<div><div><div><div><div><div><div><span>deep</span></div></div></div></div></div></div></div>';
    const el = document.body.querySelector('span') as Element;
    const selector = computeStableSelector(el, { maxDepth: 3 });
    // At most maxDepth segments joined by " > ".
    expect(selector.split(' > ').length).toBeLessThanOrEqual(3);
  });

  it('never throws and returns a non-empty string for a detached element', () => {
    const el = document.createElement('div');
    expect(() => computeStableSelector(el)).not.toThrow();
    expect(computeStableSelector(el).length).toBeGreaterThan(0);
  });

  it('skips a framework-generated id and produces a working selector without it', () => {
    const el = mount(
      '<nav id="sv_1xAVwUAj24Fl-UUqKH7fR"><a>home</a><a>about</a></nav>',
      'nav > a:nth-of-type(2)',
    );
    const selector = computeStableSelector(el);
    expect(selector).not.toContain('sv_1xAVwUAj24Fl');
    expect(document.querySelector(selector)).toBe(el);
  });

  it('anchors the path on an ancestor accessible name instead of a generated id', () => {
    const el = mount(
      '<nav aria-label="Main" id="sv_9zQ2xKjmNq7"><a>home</a><a>about</a></nav>',
      'nav > a:nth-of-type(2)',
    );
    const selector = computeStableSelector(el);
    expect(selector.startsWith('nav[aria-label="Main"]')).toBe(true);
    expect(document.querySelector(selector)).toBe(el);
  });

  it('prefers a stable data-testid over the element’s own generated id', () => {
    const el = mount('<button id="btn_a1B2c3D4e5" data-testid="save">Save</button>', 'button');
    expect(computeStableSelector(el)).toBe('[data-testid="save"]');
  });

  it('keeps a clean, human-authored id', () => {
    const el = mount('<section id="checkout-summary">x</section>', '#checkout-summary');
    expect(computeStableSelector(el)).toBe('#checkout-summary');
  });
});
