// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { ancestorBreadcrumb, deriveSelector, elementLabel } from './inspection-selector';

describe('deriveSelector', () => {
  it('prefers the element id', () => {
    expect(deriveSelector('<button id="save" class="cta">Save</button>')).toBe('#save');
  });

  it('falls back to tag plus up to three escaped classes', () => {
    expect(deriveSelector('<div class="card featured big extra">x</div>')).toBe(
      'div.card.featured.big',
    );
  });

  it('falls back to the bare tag, and escapes special characters', () => {
    expect(deriveSelector('<span>x</span>')).toBe('span');
    expect(deriveSelector('<div id="a:b">x</div>')).toBe('#a\\:b');
  });

  it('returns null when no element parses', () => {
    expect(deriveSelector('just text')).toBeNull();
    expect(deriveSelector('')).toBeNull();
  });
});

describe('elementLabel', () => {
  it('formats tag#id, tag.classes (max two), bare tag, and an unknown fallback', () => {
    expect(elementLabel('<button id="save" class="cta">x</button>')).toBe('button#save');
    expect(elementLabel('<div class="card featured big">x</div>')).toBe('div.card.featured');
    expect(elementLabel('<span>x</span>')).toBe('span');
    expect(elementLabel('just text')).toBe('<unknown>');
  });
});

describe('ancestorBreadcrumb', () => {
  it('renders root-first and ends with the element itself', () => {
    const crumb = ancestorBreadcrumb(
      [
        { tag: 'form', id: 'login', classes: [] },
        { tag: 'main', id: null, classes: ['content'] },
      ],
      '<button id="save">x</button>',
    );
    expect(crumb).toBe('main.content > form#login > button#save');
  });

  it('is just the element label when there are no ancestors', () => {
    expect(ancestorBreadcrumb([], '<div class="card">x</div>')).toBe('div.card');
  });
});
