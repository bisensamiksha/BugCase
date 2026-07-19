/**
 * Element inspection payload builder for the picker (S3-13).
 *
 * Runs where the DOM lives (the overlay's isolated world). Given a picked element it produces the
 * structural facts a developer needs — scrubbed outerHTML, the non-default computed styles, the
 * bounding box, and a short ancestor chain — as a raw payload the service worker later crops + folds
 * into `report.elementInspections`. Pure aside from reading the element: the style readers are
 * injectable, so the diff logic is unit-tested without a real layout engine.
 */

import { scrubDom, type ScrubberRuleApplied } from '@bugcase/schema';

import { CURATED_STYLE_PROPS, computeNonDefaultStyles } from './computed-styles';

const DEFAULT_MAX_ANCESTORS = 5;

export interface RawElementAncestor {
  readonly tag: string;
  readonly id: string | null;
  readonly classes: readonly string[];
}

/** What the picker collects in the page; the worker assigns id + `screenshotCropPath` at capture. */
export interface RawElementInspection {
  readonly outerHtml: string;
  readonly computedStyles: Record<string, string>;
  readonly boundingClientRect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly ancestors: readonly RawElementAncestor[];
  /** Per-rule hits from scrubbing this element's outerHTML; merged into `metadata.scrubbersApplied` at capture. */
  readonly scrubbersApplied?: readonly ScrubberRuleApplied[];
}

export interface BuildElementInspectionDeps {
  /** Reads the element's computed styles; defaults to `getComputedStyle(el)`. */
  readonly readStyles?: (el: Element) => (prop: string) => string;
  /** Reads a same-tag default element's computed styles; defaults to a detached probe. */
  readonly readDefaultStyles?: (tag: string) => (prop: string) => string;
  /** Max ancestors captured (nearest first); defaults to 5. */
  readonly maxAncestors?: number;
  /** Scrubs the outerHTML; defaults to the S2-08 DOM scrubber (masks passwords/inputs). */
  readonly scrub?: (html: string) => {
    readonly value: string;
    readonly applied: readonly ScrubberRuleApplied[];
  };
}

function defaultReadStyles(el: Element): (prop: string) => string {
  const view = el.ownerDocument?.defaultView ?? (typeof window !== 'undefined' ? window : null);
  if (!view) {
    return () => '';
  }
  const declaration = view.getComputedStyle(el);
  return (prop) => declaration.getPropertyValue(prop);
}

/** Snapshot a fresh same-tag element's curated computed styles, then remove the probe. */
function defaultReadDefaultStyles(tag: string): (prop: string) => string {
  const doc = typeof document !== 'undefined' ? document : null;
  const view = doc?.defaultView ?? (typeof window !== 'undefined' ? window : null);
  if (!doc || !view || !doc.body) {
    return () => '';
  }
  const snapshot: Record<string, string> = {};
  try {
    const probe = doc.createElement(tag);
    doc.body.appendChild(probe);
    const declaration = view.getComputedStyle(probe);
    for (const prop of CURATED_STYLE_PROPS) {
      snapshot[prop] = declaration.getPropertyValue(prop);
    }
    probe.remove();
  } catch {
    // Exotic tag / detached document — treat all defaults as empty.
  }
  return (prop) => snapshot[prop] ?? '';
}

function collectAncestors(el: Element, max: number): RawElementAncestor[] {
  const ancestors: RawElementAncestor[] = [];
  let current = el.parentElement;
  while (current && ancestors.length < max) {
    ancestors.push({
      tag: current.tagName.toLowerCase(),
      id: current.id || null,
      classes: current.classList ? Array.from(current.classList) : [],
    });
    current = current.parentElement;
  }
  return ancestors;
}

function rectOf(el: Element): RawElementInspection['boundingClientRect'] {
  try {
    const rect = el.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  } catch {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
}

export function buildElementInspection(
  el: Element,
  deps: BuildElementInspectionDeps = {},
): RawElementInspection {
  const readStyles = deps.readStyles ?? defaultReadStyles;
  const readDefaultStyles = deps.readDefaultStyles ?? defaultReadDefaultStyles;
  const maxAncestors = deps.maxAncestors ?? DEFAULT_MAX_ANCESTORS;
  const scrub =
    deps.scrub ??
    ((html: string) => {
      const result = scrubDom(html);
      return { value: result.value, applied: result.applied };
    });
  const tag = el.tagName.toLowerCase();
  const scrubbed = scrub(el.outerHTML);

  return {
    outerHtml: scrubbed.value,
    computedStyles: computeNonDefaultStyles(readStyles(el), readDefaultStyles(tag)),
    boundingClientRect: rectOf(el),
    ancestors: collectAncestors(el, maxAncestors),
    scrubbersApplied: scrubbed.applied,
  };
}
