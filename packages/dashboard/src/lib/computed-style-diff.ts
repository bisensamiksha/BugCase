/**
 * Grouping + filtering for the element-inspections computed-styles diff (S4-11). The picker
 * already stores only non-default properties; these helpers organize that stored diff for display
 * (DevTools-like categories, alphabetical within a group). Pure — no React, no DOM.
 */

export interface StyleGroup {
  readonly label: string;
  readonly entries: readonly (readonly [string, string])[];
}

export const STYLE_CATEGORY_ORDER: readonly string[] = [
  'Layout',
  'Box',
  'Typography',
  'Color & background',
  'Other',
];

interface Category {
  readonly label: string;
  readonly names: ReadonlySet<string>;
  readonly prefixes: readonly string[];
}

/** Checked in order; the first category whose exact name or prefix matches wins. */
const CATEGORIES: readonly Category[] = [
  {
    label: 'Layout',
    names: new Set([
      'display',
      'position',
      'top',
      'right',
      'bottom',
      'left',
      'inset',
      'float',
      'clear',
      'z-index',
      'gap',
      'row-gap',
      'column-gap',
      'order',
    ]),
    prefixes: ['flex', 'grid', 'align-', 'justify-', 'place-', 'overflow'],
  },
  {
    label: 'Box',
    names: new Set(['width', 'height', 'aspect-ratio']),
    prefixes: ['min-', 'max-', 'margin', 'padding', 'border', 'box-', 'outline'],
  },
  {
    label: 'Typography',
    names: new Set([
      'line-height',
      'letter-spacing',
      'white-space',
      'tab-size',
      'vertical-align',
      'direction',
      'writing-mode',
    ]),
    prefixes: ['font', 'text-', 'word-'],
  },
  {
    label: 'Color & background',
    names: new Set(['color', 'opacity', 'fill', 'stroke', 'caret-color', 'accent-color']),
    prefixes: ['background'],
  },
];

function categoryOf(prop: string): string {
  for (const category of CATEGORIES) {
    if (category.names.has(prop) || category.prefixes.some((p) => prop.startsWith(p))) {
      return category.label;
    }
  }
  return 'Other';
}

/** Group a styles record into the fixed category order; empty groups omitted, entries sorted. */
export function categorizeStyles(styles: Readonly<Record<string, string>>): readonly StyleGroup[] {
  const buckets = new Map<string, [string, string][]>(
    STYLE_CATEGORY_ORDER.map((label) => [label, []]),
  );
  for (const [prop, value] of Object.entries(styles)) {
    buckets.get(categoryOf(prop))?.push([prop, value]);
  }
  return STYLE_CATEGORY_ORDER.map((label) => ({
    label,
    entries: (buckets.get(label) ?? []).sort((a, b) => a[0].localeCompare(b[0])),
  })).filter((group) => group.entries.length > 0);
}

/** Case-insensitive substring filter over property names and values; blank query keeps all. */
export function filterStyles(
  styles: Readonly<Record<string, string>>,
  query: string,
): Readonly<Record<string, string>> {
  const q = query.trim().toLowerCase();
  if (q === '') {
    return styles;
  }
  return Object.fromEntries(
    Object.entries(styles).filter(
      ([prop, value]) => prop.toLowerCase().includes(q) || value.toLowerCase().includes(q),
    ),
  );
}
