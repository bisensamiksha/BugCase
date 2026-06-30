import { describe, expect, it } from 'vitest';

import { DOM_SANDBOX, buildSandboxSrcDoc, decodeDataUrlText } from './sandbox-html';

/** Build the same `data:text/plain;base64,…` URL the SW peek bridge returns for held HTML. */
function base64DataUrl(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return `data:text/plain;base64,${btoa(binary)}`;
}

describe('DOM_SANDBOX', () => {
  it('grants neither scripts nor same-origin (maximally restrictive)', () => {
    expect(DOM_SANDBOX).toBe('');
    expect(DOM_SANDBOX).not.toContain('allow-scripts');
    expect(DOM_SANDBOX).not.toContain('allow-same-origin');
  });
});

describe('decodeDataUrlText', () => {
  it('decodes a base64 data URL back to the original UTF-8 HTML', () => {
    const html = '<p>café 🚀 <b>bold</b></p>';
    expect(decodeDataUrlText(base64DataUrl(html))).toBe(html);
  });

  it('decodes a non-base64 (URL-encoded) data URL', () => {
    const html = '<b>hi & bye</b>';
    expect(decodeDataUrlText(`data:text/plain,${encodeURIComponent(html)}`)).toBe(html);
  });

  it('throws on a value that is not a data URL', () => {
    expect(() => decodeDataUrlText('https://example.com/x.html')).toThrow();
  });
});

describe('buildSandboxSrcDoc', () => {
  it('injects a network-blocking CSP into an existing <head>', () => {
    const out = buildSandboxSrcDoc('<html><head><title>t</title></head><body>x</body></html>');
    expect(out).toContain('Content-Security-Policy');
    expect(out).toContain("default-src 'none'");
    // The CSP lands inside <head>, before the title it should govern.
    expect(out.indexOf('Content-Security-Policy')).toBeGreaterThan(out.indexOf('<head'));
    expect(out.indexOf('Content-Security-Policy')).toBeLessThan(out.indexOf('<title'));
  });

  it('prepends the CSP when there is no <head>', () => {
    const out = buildSandboxSrcDoc('<div>x</div>');
    expect(out).toContain("default-src 'none'");
    expect(out.indexOf('Content-Security-Policy')).toBeLessThan(out.indexOf('<div'));
  });
});
