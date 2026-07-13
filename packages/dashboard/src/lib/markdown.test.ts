// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { renderMarkdownToSafeHtml } from './markdown';

describe('renderMarkdownToSafeHtml', () => {
  it('renders basic Markdown formatting', () => {
    expect(renderMarkdownToSafeHtml('**bold**')).toContain('<strong>bold</strong>');
    expect(renderMarkdownToSafeHtml('_italic_')).toContain('<em>italic</em>');
    const list = renderMarkdownToSafeHtml('- one\n- two');
    expect(list).toContain('<li>one</li>');
    expect(list).toContain('<li>two</li>');
  });

  it('keeps http(s) links and hardens them with rel + target', () => {
    const html = renderMarkdownToSafeHtml('[site](https://example.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain('target="_blank"');
  });

  it('strips <script> tags and their contents', () => {
    const html = renderMarkdownToSafeHtml('hello <script>alert(1)</script> world');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
  });

  it('drops images entirely so untrusted notes cannot phone home', () => {
    const markdownImage = renderMarkdownToSafeHtml('![x](https://evil.example/beacon.png)');
    expect(markdownImage).not.toContain('<img');
    expect(markdownImage).not.toContain('evil.example');

    const rawImage = renderMarkdownToSafeHtml('<img src="x" onerror="alert(1)">');
    expect(rawImage).not.toContain('<img');
    expect(rawImage).not.toContain('onerror');
  });

  it('neutralizes javascript: and other dangerous URL schemes', () => {
    const html = renderMarkdownToSafeHtml('[x](javascript:alert(1))');
    expect(html.toLowerCase()).not.toContain('javascript:');
  });

  it('returns an empty string for empty or whitespace-only input', () => {
    expect(renderMarkdownToSafeHtml('')).toBe('');
    expect(renderMarkdownToSafeHtml('   \n  ')).toBe('');
  });

  it('never throws on malformed input', () => {
    expect(() => renderMarkdownToSafeHtml('# unterminated [link](')).not.toThrow();
  });
});
