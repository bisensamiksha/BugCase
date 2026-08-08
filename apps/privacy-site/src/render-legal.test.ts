import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { LEGAL_CSP, renderLegalPage } from './render-legal';

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

  describe('Content-Security-Policy (S4-31)', () => {
    it('ships an enforced CSP meta tag', () => {
      expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="${LEGAL_CSP}">`);
      // Enforced, not report-only.
      expect(html).not.toContain('Content-Security-Policy-Report-Only');
    });

    it('locks the page down to nothing by default and forbids scripts outright', () => {
      expect(LEGAL_CSP).toContain("default-src 'none'");
      expect(LEGAL_CSP).toContain("script-src 'none'");
      expect(LEGAL_CSP).toContain("object-src 'none'");
      expect(LEGAL_CSP).toContain("base-uri 'none'");
      expect(LEGAL_CSP).toContain("form-action 'none'");
    });

    it('forbids every remote origin, so the zero-telemetry promise has a browser-enforced backstop', () => {
      expect(LEGAL_CSP).toContain("connect-src 'none'");
      expect(LEGAL_CSP).not.toMatch(/https?:/);
      expect(LEGAL_CSP).not.toContain('*');
    });

    it('never reports violations anywhere: a report endpoint would be remote logging', () => {
      expect(LEGAL_CSP).not.toContain('report-uri');
      expect(LEGAL_CSP).not.toContain('report-to');
    });

    it('allows the inline style by hash, so no unsafe-inline is needed at all', () => {
      expect(LEGAL_CSP).not.toContain('unsafe-inline');
      expect(LEGAL_CSP).not.toContain('unsafe-eval');
      expect(LEGAL_CSP).toMatch(/style-src 'sha256-[A-Za-z0-9+/]+=*'/);
    });

    it('hashes the exact bytes of the style element it emits', () => {
      // Recompute from the rendered page, not from the module: a hash that does not match the
      // shipped bytes is the one failure mode that silently breaks every legal page at once.
      const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1];
      expect(style).toBeTruthy();
      const digest = createHash('sha256').update(style!, 'utf8').digest('base64');
      expect(LEGAL_CSP).toContain(`'sha256-${digest}'`);
    });
  });
});
