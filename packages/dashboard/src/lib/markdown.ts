import DOMPurify from 'dompurify';
import { marked } from 'marked';

/**
 * Render untrusted report notes (Markdown) into a safe HTML string (S4-03).
 *
 * Every field inside a report ZIP is untrusted input, so notes are parsed with `marked` and then
 * sanitized with DOMPurify against a **strict allowlist**. Images are intentionally excluded: a
 * remote `<img src>` would issue a network request from note content, which would break BugCase's
 * "nothing leaves the local browser" guarantee. Links are hardened (`rel`/`target`) and restricted
 * to http(s)/mailto/anchor schemes, so `javascript:`/`data:` payloads are dropped.
 */

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'code',
  'pre',
  'ul',
  'ol',
  'li',
  'blockquote',
  'a',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
];

const ALLOWED_ATTR = ['href'];

// Only http(s), mailto, and in-document anchors — no `javascript:`, `data:`, or `blob:` URIs.
const ALLOWED_URI_REGEXP = /^(?:https?:|mailto:|#)/i;

let hooksInstalled = false;

/** Harden every surviving anchor once — added to the shared DOMPurify instance a single time. */
function installHooks(): void {
  if (hooksInstalled) {
    return;
  }
  hooksInstalled = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.hasAttribute('href')) {
      node.setAttribute('rel', 'noopener noreferrer nofollow');
      node.setAttribute('target', '_blank');
    }
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Parse `markdown` and return sanitized HTML safe to inject. Empty/whitespace input returns `''`.
 * Any parser/sanitizer failure falls back to HTML-escaped plain text — this never throws and never
 * emits unsanitized HTML.
 */
export function renderMarkdownToSafeHtml(markdown: string): string {
  if (!markdown || markdown.trim() === '') {
    return '';
  }
  installHooks();
  try {
    const rawHtml = marked.parse(markdown, { async: false });
    return DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOWED_URI_REGEXP,
    });
  } catch {
    return escapeHtml(markdown);
  }
}
