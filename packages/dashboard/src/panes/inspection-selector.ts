import type { ElementAncestor } from '@bugcase/schema';

import { parseHtmlDocument } from './dom-search';

/**
 * Best-effort selector/label helpers for element inspections (S4-11). The S3-13 picker stores no
 * selector, so these derive one from the inspection's own (scrubbed) outerHTML via the same inert
 * DOMParser the DOM pane uses — nothing renders, nothing fetches. A derived selector may match 0
 * or several nodes in the end-state snapshot; the DOM pane reports that honestly.
 */

function cssEscape(value: string): string {
  const css = (globalThis as { CSS?: { escape?: (v: string) => string } }).CSS;
  return css?.escape ? css.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

function firstElement(outerHtml: string): Element | null {
  if (outerHtml.trim() === '') {
    return null;
  }
  return parseHtmlDocument(outerHtml).body.firstElementChild;
}

/** `#id` → `tag.classes` (≤3, escaped) → bare tag; null when nothing parses as an element. */
export function deriveSelector(outerHtml: string): string | null {
  const el = firstElement(outerHtml);
  if (el === null) {
    return null;
  }
  if (el.id) {
    return `#${cssEscape(el.id)}`;
  }
  const tag = el.tagName.toLowerCase();
  const classes = [...el.classList].slice(0, 3);
  return classes.length > 0 ? `${tag}${classes.map((c) => `.${cssEscape(c)}`).join('')}` : tag;
}

/** Short display label: `button#save`, `div.card.featured` (≤2 classes), `span`, `<unknown>`. */
export function elementLabel(outerHtml: string): string {
  const el = firstElement(outerHtml);
  if (el === null) {
    return '<unknown>';
  }
  const tag = el.tagName.toLowerCase();
  if (el.id) {
    return `${tag}#${el.id}`;
  }
  const classes = [...el.classList].slice(0, 2);
  return classes.length > 0 ? `${tag}.${classes.join('.')}` : tag;
}

function ancestorLabel(ancestor: ElementAncestor): string {
  if (ancestor.id) {
    return `${ancestor.tag}#${ancestor.id}`;
  }
  const classes = ancestor.classes.slice(0, 2);
  return classes.length > 0 ? `${ancestor.tag}.${classes.join('.')}` : ancestor.tag;
}

/** Ancestors are stored nearest-first; render root-first, ending with the element itself. */
export function ancestorBreadcrumb(
  ancestors: readonly ElementAncestor[],
  outerHtml: string,
): string {
  const parts = [...ancestors].reverse().map(ancestorLabel);
  parts.push(elementLabel(outerHtml));
  return parts.join(' > ');
}
