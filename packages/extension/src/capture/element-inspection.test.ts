// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { buildElementInspection } from './element-inspection';

afterEach(() => {
  document.body.innerHTML = '';
});

function styleReader(values: Record<string, string>): () => (prop: string) => string {
  return () => (prop) => values[prop] ?? '';
}

describe('buildElementInspection', () => {
  it('captures scrubbed outerHTML, non-default styles, a bbox, and the ancestor chain', () => {
    document.body.innerHTML =
      '<main id="root"><section class="a b"><button id="go">Go</button></section></main>';
    const el = document.getElementById('go') as Element;
    const inspection = buildElementInspection(el, {
      readStyles: styleReader({ display: 'inline-flex' }),
      readDefaultStyles: () => () => 'inline', // default display for a fresh element
    });

    expect(inspection.outerHtml).toContain('id="go"');
    expect(inspection.computedStyles).toEqual({ display: 'inline-flex' });
    const rect = inspection.boundingClientRect;
    expect(typeof rect.x).toBe('number');
    expect(typeof rect.y).toBe('number');
    expect(typeof rect.width).toBe('number');
    expect(typeof rect.height).toBe('number');
    // Ancestors nearest-first: section (with classes) then main#root.
    expect(inspection.ancestors[0]).toEqual({ tag: 'section', id: null, classes: ['a', 'b'] });
    expect(inspection.ancestors[1]).toEqual({ tag: 'main', id: 'root', classes: [] });
  });

  it('scrubs the outerHTML so a password value never appears', () => {
    document.body.innerHTML = '<form><input id="p" type="password" value="hunter2" /></form>';
    const el = document.getElementById('p') as Element;
    const inspection = buildElementInspection(el, {
      readStyles: styleReader({}),
      readDefaultStyles: () => () => '',
    });
    expect(inspection.outerHtml).not.toContain('hunter2');
  });

  it('caps the ancestor chain at maxAncestors', () => {
    document.body.innerHTML =
      '<div><div><div><div><div><div><div><span id="deep">x</span></div></div></div></div></div></div></div>';
    const el = document.getElementById('deep') as Element;
    const inspection = buildElementInspection(el, {
      readStyles: styleReader({}),
      readDefaultStyles: () => () => '',
      maxAncestors: 3,
    });
    expect(inspection.ancestors).toHaveLength(3);
  });

  it('does not throw for an element with no ancestors', () => {
    const el = document.createElement('div');
    expect(() =>
      buildElementInspection(el, {
        readStyles: styleReader({}),
        readDefaultStyles: () => () => '',
      }),
    ).not.toThrow();
    expect(
      buildElementInspection(el, { readStyles: styleReader({}), readDefaultStyles: () => () => '' })
        .ancestors,
    ).toEqual([]);
  });
});
