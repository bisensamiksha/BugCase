import { describe, expect, it } from 'vitest';

import { CURATED_STYLE_PROPS, computeNonDefaultStyles } from './computed-styles';

function reader(values: Record<string, string>): (prop: string) => string {
  return (prop) => values[prop] ?? '';
}

describe('computeNonDefaultStyles', () => {
  it('keeps only properties that differ from the same-tag default', () => {
    const el = reader({ display: 'flex', color: 'rgb(0, 0, 0)', 'font-size': '16px' });
    const def = reader({ display: 'block', color: 'rgb(0, 0, 0)', 'font-size': '16px' });
    const result = computeNonDefaultStyles(el, def, ['display', 'color', 'font-size']);
    expect(result).toEqual({ display: 'flex' });
  });

  it('drops empty values', () => {
    const el = reader({ display: '', color: 'red' });
    const def = reader({ display: 'block', color: 'black' });
    expect(computeNonDefaultStyles(el, def, ['display', 'color'])).toEqual({ color: 'red' });
  });

  it('defaults to the curated property list', () => {
    const el = reader({ position: 'absolute' });
    const def = reader({ position: 'static' });
    expect(computeNonDefaultStyles(el, def)).toEqual({ position: 'absolute' });
    // A property not in the curated list is ignored even if it differs.
    const el2 = reader({ 'unlisted-prop': 'x' });
    expect(computeNonDefaultStyles(el2, reader({}))).toEqual({});
  });

  it('exposes a bounded, meaningful curated list', () => {
    expect(CURATED_STYLE_PROPS).toContain('display');
    expect(CURATED_STYLE_PROPS).toContain('color');
    expect(CURATED_STYLE_PROPS.length).toBeGreaterThan(20);
    expect(CURATED_STYLE_PROPS.length).toBeLessThan(80);
  });
});
