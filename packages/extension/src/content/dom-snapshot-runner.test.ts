// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { readDomOuterHtml } from './dom-snapshot-runner';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('readDomOuterHtml', () => {
  it('returns the documentElement outerHTML including page content', () => {
    document.body.innerHTML = '<p id="x">hello</p>';
    const html = readDomOuterHtml();
    expect(html.toLowerCase()).toContain('<html');
    expect(html).toContain('<p id="x">hello</p>');
  });

  it('uses an injected document', () => {
    const doc = document.implementation.createHTMLDocument('t');
    doc.body.innerHTML = '<span>z</span>';
    expect(readDomOuterHtml(doc)).toContain('<span>z</span>');
  });
});
