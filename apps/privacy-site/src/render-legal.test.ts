import { describe, expect, it } from 'vitest';

import { renderLegalPage } from './render-legal';

const html = renderLegalPage({
  title: 'BugCase — Sample',
  markdown: '# Heading One\n\nA paragraph with **bold** text.\n\n- item a\n- item b\n',
});

describe('renderLegalPage', () => {
  it('emits a complete self-contained HTML document', () => {
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');
  });

  it('puts the title in <title> and renders the markdown to HTML', () => {
    expect(html).toContain('<title>BugCase — Sample</title>');
    expect(html).toContain('<h1>Heading One</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<li>item a</li>');
  });

  it('inlines all styling and references no external hosts', () => {
    expect(html).toContain('<style>');
    // No remote scripts, stylesheets, fonts, or images.
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/src\s*=\s*["']https?:/i);
    expect(html).not.toMatch(/<link\b[^>]+href\s*=\s*["']https?:/i);
  });

  it('escapes the title so it cannot break out of the tag', () => {
    const evil = renderLegalPage({ title: 'a</title><script>x', markdown: 'x' });
    expect(evil).not.toContain('<title>a</title><script>');
    expect(evil).not.toMatch(/<script\b/i);
  });
});
