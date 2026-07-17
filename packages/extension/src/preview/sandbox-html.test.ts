import * as sharedUi from '@bugcase/shared-ui';
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

describe('sandbox re-export', () => {
  it('exposes the shared-ui sandbox logic — the single security-critical copy (S4-09)', () => {
    expect(DOM_SANDBOX).toBe(sharedUi.DOM_SANDBOX);
    expect(buildSandboxSrcDoc).toBe(sharedUi.buildSandboxSrcDoc);
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
