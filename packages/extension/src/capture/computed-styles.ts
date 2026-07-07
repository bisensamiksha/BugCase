/**
 * Non-default computed-style diff for the element inspector (S3-13).
 *
 * The devtools "Computed" panel lists ~350 properties; most equal the element's initial/default value
 * and are noise. This keeps only a curated set of meaningful properties whose value differs from a
 * fresh element of the same tag — so an inspection captures "what's actually styled" without the bulk.
 * Pure: the caller supplies the readers (element + default), so it is trivially unit-tested.
 */

/** Meaningful computed properties, grouped: box model, flex/grid, typography, color, border, misc. */
export const CURATED_STYLE_PROPS: readonly string[] = [
  // box model
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'width',
  'height',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'box-sizing',
  'overflow',
  // flex / grid
  'flex-direction',
  'flex-wrap',
  'justify-content',
  'align-items',
  'gap',
  'grid-template-columns',
  'grid-template-rows',
  // typography
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-transform',
  'white-space',
  // color / visibility
  'color',
  'background-color',
  'background-image',
  'opacity',
  'visibility',
  // border / effects
  'border-top-width',
  'border-style',
  'border-color',
  'border-radius',
  'box-shadow',
  'outline',
  // misc
  'z-index',
  'cursor',
  'transform',
];

/**
 * Keep the `props` whose computed value is non-empty and differs from the same-tag default.
 * `read`/`readDefault` are `getComputedStyle(...).getPropertyValue`-style getters.
 */
export function computeNonDefaultStyles(
  read: (prop: string) => string,
  readDefault: (prop: string) => string,
  props: readonly string[] = CURATED_STYLE_PROPS,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const prop of props) {
    const value = read(prop);
    if (value !== '' && value !== readDefault(prop)) {
      out[prop] = value;
    }
  }
  return out;
}
