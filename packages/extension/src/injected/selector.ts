/**
 * Stable selector algorithm for the reproduction recorder (S3-12).
 *
 * Given an element, produce a CSS selector that identifies it as robustly as reasonable, preferring
 * attributes authors keep stable over positional paths. Priority:
 *   1. a unique `id`
 *   2. `data-testid`, then any other `data-*` attribute
 *   3. `role` + `aria-label` (an accessible-name selector), or `aria-label` alone
 *   4. a depth-capped `:nth-of-type` CSS path, anchored at the nearest id-bearing ancestor
 *
 * Pure and defensive: DOM in, string out. Never throws — a detached or exotic element still yields a
 * non-empty best-effort selector. It records *where* an interaction happened, never page content.
 */

export interface StableSelectorOptions {
  /** Max path segments before the walk stops (keeps selectors bounded). Default 5. */
  readonly maxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 5;

function cssEscape(value: string): string {
  const api = (globalThis as { CSS?: { escape?: (input: string) => string } }).CSS;
  if (api?.escape) {
    return api.escape(value);
  }
  // Node fallback (tests may run without a CSS global): escape the characters that would break an
  // attribute-value or id selector.
  return value.replace(/["\\]/g, '\\$&');
}

function isUnique(doc: Document, selector: string, el: Element): boolean {
  try {
    const matches = doc.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === el;
  } catch {
    return false; // invalid selector (exotic attribute value) — treat as not usable
  }
}

function attrSelector(name: string, value: string): string {
  return `[${name}="${cssEscape(value)}"]`;
}

function idSelector(id: string): string {
  return `#${cssEscape(id)}`;
}

function tagName(el: Element): string {
  return el.tagName.toLowerCase();
}

/** Count case transitions (upper↔lower) among the letters of a string. */
function caseTransitions(value: string): number {
  let count = 0;
  let prev: boolean | null = null;
  for (const ch of value) {
    if (!/[A-Za-z]/.test(ch)) {
      prev = null;
      continue;
    }
    const upper = ch === ch.toUpperCase();
    if (prev !== null && prev !== upper) {
      count += 1;
    }
    prev = upper;
  }
  return count;
}

/**
 * Heuristic: does this id look framework-generated (random) rather than authored + stable? Such ids
 * change every page load, so a "stable" selector must not lean on them. Flags any `-_:.`-separated
 * segment ≥8 chars that mixes letters + digits (e.g. `sv_1xAVwUAj24Fl`) or churns case (random casing),
 * while leaving human ids (`checkout-summary`, `loginButton`) alone.
 */
export function looksGeneratedId(id: string): boolean {
  for (const segment of id.split(/[-_:.]/)) {
    if (segment.length < 8) {
      continue;
    }
    if (/[A-Za-z]/.test(segment) && /[0-9]/.test(segment)) {
      return true;
    }
    if (caseTransitions(segment) >= 4) {
      return true;
    }
  }
  return false;
}

/** A single path segment: the tag, plus `:nth-of-type(n)` when it has same-tag siblings. */
function nthOfTypeSegment(el: Element): string {
  const tag = tagName(el);
  const parent = el.parentElement;
  if (!parent) {
    return tag;
  }
  const sameType = Array.from(parent.children).filter((child) => child.tagName === el.tagName);
  if (sameType.length <= 1) {
    return tag;
  }
  return `${tag}:nth-of-type(${sameType.indexOf(el) + 1})`;
}

/**
 * A unique, authored, stable selector for `el` (a non-generated id, `data-*`, or accessible name), or
 * `null` when none applies. Shared by the element itself and by each ancestor when building a path, so
 * the path can anchor on a stable ancestor (e.g. `nav[aria-label="Main"]`) rather than a random id.
 */
function stableAnchor(el: Element, doc: Document): string | null {
  // 1. A unique, human-authored id (skip framework-generated ones — they change every load).
  const id = el.getAttribute('id');
  if (id && !looksGeneratedId(id) && isUnique(doc, idSelector(id), el)) {
    return idSelector(id);
  }

  // 2. data-testid first, then any other data-* attribute in document order — but skip attributes
  //    whose *value* looks framework-generated (e.g. data-node-id="g8GjkJAhvnSxXTZks0V1g"), which
  //    changes every load and would produce an unstable, unreadable selector.
  const testId = el.getAttribute('data-testid');
  if (testId !== null && !looksGeneratedId(testId)) {
    const selector = attrSelector('data-testid', testId);
    if (isUnique(doc, selector, el)) {
      return selector;
    }
  }
  for (const attr of Array.from(el.attributes)) {
    if (
      attr.name !== 'data-testid' &&
      attr.name.startsWith('data-') &&
      !looksGeneratedId(attr.value)
    ) {
      const selector = attrSelector(attr.name, attr.value);
      if (isUnique(doc, selector, el)) {
        return selector;
      }
    }
  }

  // 3. role + aria-label, or aria-label alone (accessible name).
  const role = el.getAttribute('role');
  const label = el.getAttribute('aria-label');
  if (role && label) {
    const selector = `${attrSelector('role', role)}${attrSelector('aria-label', label)}`;
    if (isUnique(doc, selector, el)) {
      return selector;
    }
  }
  if (label) {
    const selector = `${tagName(el)}${attrSelector('aria-label', label)}`;
    if (isUnique(doc, selector, el)) {
      return selector;
    }
  }
  return null;
}

export function computeStableSelector(el: Element, options: StableSelectorOptions = {}): string {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const doc = el.ownerDocument ?? (typeof document !== 'undefined' ? document : null);

  if (doc) {
    const own = stableAnchor(el, doc);
    if (own) {
      return own;
    }
  }

  // Depth-capped nth-of-type path, anchored at the nearest stable ancestor (id/data-*/accessible name).
  const segments: string[] = [];
  let current: Element | null = el;
  let depth = 0;
  while (current && depth < maxDepth) {
    if (doc && current !== el) {
      const anchor = stableAnchor(current, doc);
      if (anchor) {
        segments.unshift(anchor);
        return segments.join(' > ');
      }
    }
    segments.unshift(nthOfTypeSegment(current));
    current = current.parentElement;
    depth += 1;
  }
  return segments.join(' > ') || tagName(el);
}
