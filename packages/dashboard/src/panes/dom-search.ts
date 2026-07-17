/**
 * Element-search helpers for the DOM pane (S4-09). The snapshot is parsed with `DOMParser` into an
 * INERT document — scripts never run and no subresource is fetched — so CSS-selector search can use
 * the real `querySelectorAll` without ever giving the captured page a live browsing context. The
 * rendered preview stays byte-faithful raw text except when a match is active, where
 * {@link markedSnapshotHtml} serializes a marked copy (the locked sandbox allows no scripts, so the
 * highlight must be baked into the srcDoc itself).
 */

/** Marker attribute stamped on the active match; also the hook the injected outline style targets. */
export const ACTIVE_MATCH_ATTR = 'data-bugcase-active-match';

/** Outline for the active match; inline styles are allowed by the sandbox CSP (`style-src`). */
const ACTIVE_MATCH_STYLE = `[${ACTIVE_MATCH_ATTR}] { outline: 3px solid #f59e0b !important; outline-offset: 2px; }`;

/** Breadcrumbs show at most this many path segments; deeper chains are prefixed with an ellipsis. */
const BREADCRUMB_MAX_SEGMENTS = 5;

export type ElementSearchResult =
  | { readonly ok: true; readonly matches: readonly Element[] }
  | { readonly ok: false; readonly error: string };

/** Parse snapshot text into an inert document (no scripts, no fetches, no browsing context). */
export function parseHtmlDocument(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

/** Run a CSS selector against the parsed snapshot. Blank → no matches; invalid → `ok: false`. */
export function searchElements(doc: Document, selector: string): ElementSearchResult {
  const trimmed = selector.trim();
  if (trimmed === '') {
    return { ok: true, matches: [] };
  }
  try {
    return { ok: true, matches: [...doc.querySelectorAll(trimmed)] };
  } catch {
    return { ok: false, error: 'Invalid CSS selector.' };
  }
}

function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const classes = [...el.classList].map((c) => `.${c}`).join('');
  return `${tag}${id}${classes}`;
}

/**
 * `tag#id.class` path from the outermost interesting ancestor down to the element itself —
 * `html`/`body` are skipped as noise. Deep chains are capped to the last
 * {@link BREADCRUMB_MAX_SEGMENTS} segments behind a leading ellipsis.
 */
export function elementBreadcrumb(el: Element): string {
  const chain: string[] = [];
  for (
    let node: Element | null = el;
    node && node.tagName !== 'BODY' && node.tagName !== 'HTML';
    node = node.parentElement
  ) {
    chain.unshift(describeElement(node));
  }
  if (chain.length === 0) {
    chain.push(describeElement(el));
  }
  if (chain.length > BREADCRUMB_MAX_SEGMENTS) {
    return ['…', ...chain.slice(-BREADCRUMB_MAX_SEGMENTS)].join(' > ');
  }
  return chain.join(' > ');
}

/** The element's `outerHTML`, truncated with an ellipsis beyond `maxChars`. */
export function elementSnippet(el: Element, maxChars = 300): string {
  const html = el.outerHTML;
  return html.length > maxChars ? `${html.slice(0, maxChars)}…` : html;
}

/**
 * Serialize a copy of the snapshot with the `index`-th match of `selector` stamped with
 * {@link ACTIVE_MATCH_ATTR} and the outline style injected into `<head>`. Returns `null` when the
 * selector is invalid or the index is out of range — callers fall back to the untouched raw text.
 * (Serialization normalizes markup, so it is used only while a match is highlighted.)
 */
export function markedSnapshotHtml(
  rawHtml: string,
  selector: string,
  index: number,
): string | null {
  const doc = parseHtmlDocument(rawHtml);
  const result = searchElements(doc, selector);
  if (!result.ok) {
    return null;
  }
  const target = result.matches[index];
  if (!target) {
    return null;
  }
  target.setAttribute(ACTIVE_MATCH_ATTR, '');
  const style = doc.createElement('style');
  style.textContent = ACTIVE_MATCH_STYLE;
  doc.head.appendChild(style);
  return `<!doctype html>${doc.documentElement.outerHTML}`;
}
