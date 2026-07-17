// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import {
  ACTIVE_MATCH_ATTR,
  elementBreadcrumb,
  elementSnippet,
  markedSnapshotHtml,
  parseHtmlDocument,
  searchElements,
} from './dom-search';

const SNAPSHOT = [
  '<!doctype html><html><head><title>t</title></head><body>',
  '<main id="root"><section class="card featured"><button class="cta">Buy</button></section>',
  '<section class="card"><button class="cta">Try</button></section></main>',
  '</body></html>',
].join('');

describe('parseHtmlDocument', () => {
  it('parses snapshot text into an inert document (scripts never execute)', () => {
    const doc = parseHtmlDocument(
      '<body><script>globalThis.__pwned = true;</script><p>x</p></body>',
    );
    expect(doc.querySelector('p')?.textContent).toBe('x');
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
  });
});

describe('searchElements', () => {
  it('finds matches for a CSS selector in document order', () => {
    const doc = parseHtmlDocument(SNAPSHOT);
    const result = searchElements(doc, 'button.cta');
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.matches.map((m) => m.textContent)).toEqual(['Buy', 'Try']);
  });

  it('returns ok with no matches for a blank selector', () => {
    const doc = parseHtmlDocument(SNAPSHOT);
    const result = searchElements(doc, '   ');
    expect(result).toEqual({ ok: true, matches: [] });
  });

  it('reports an invalid selector instead of throwing', () => {
    const doc = parseHtmlDocument(SNAPSHOT);
    const result = searchElements(doc, ':::nope');
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toContain('selector');
  });
});

describe('elementBreadcrumb', () => {
  it('renders tag#id.class notation for the element and its ancestors', () => {
    const doc = parseHtmlDocument(SNAPSHOT);
    const button = doc.querySelector('section.featured button');
    expect(button).not.toBeNull();
    const crumb = elementBreadcrumb(button!);
    expect(crumb).toBe('main#root > section.card.featured > button.cta');
  });

  it('caps deep ancestor chains rather than growing without bound', () => {
    const deep = parseHtmlDocument(
      '<body><i><i><i><i><i><i><i><b id="leaf">x</b></i></i></i></i></i></i></i></body>',
    );
    const crumb = elementBreadcrumb(deep.querySelector('#leaf')!);
    expect(crumb.startsWith('…')).toBe(true);
    expect(crumb.endsWith('b#leaf')).toBe(true);
    expect(crumb.split('>').length).toBeLessThanOrEqual(6);
  });
});

describe('elementSnippet', () => {
  it('returns short outerHTML unchanged', () => {
    const doc = parseHtmlDocument(SNAPSHOT);
    expect(elementSnippet(doc.querySelector('button')!, 100)).toBe(
      '<button class="cta">Buy</button>',
    );
  });

  it('truncates long outerHTML with an ellipsis', () => {
    const doc = parseHtmlDocument(SNAPSHOT);
    const snippet = elementSnippet(doc.querySelector('main')!, 40);
    expect(snippet.length).toBe(41);
    expect(snippet.endsWith('…')).toBe(true);
  });
});

describe('markedSnapshotHtml', () => {
  it('marks the nth match and injects the outline style, preserving the CSP-compatible doc shape', () => {
    const marked = markedSnapshotHtml(SNAPSHOT, 'button.cta', 1);
    expect(marked).not.toBeNull();
    expect(marked!.startsWith('<!doctype html>')).toBe(true);
    // Exactly one element carries the marker — the second .cta button.
    const remarked = parseHtmlDocument(marked!);
    const flagged = remarked.querySelectorAll(`[${ACTIVE_MATCH_ATTR}]`);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.textContent).toBe('Try');
    // The highlight style rides inside <head> (allowed by the sandbox CSP's inline style-src).
    expect(remarked.head.querySelector('style')?.textContent).toContain(ACTIVE_MATCH_ATTR);
  });

  it('returns null for an invalid selector or an out-of-range index', () => {
    expect(markedSnapshotHtml(SNAPSHOT, ':::nope', 0)).toBeNull();
    expect(markedSnapshotHtml(SNAPSHOT, 'button.cta', 5)).toBeNull();
  });
});
