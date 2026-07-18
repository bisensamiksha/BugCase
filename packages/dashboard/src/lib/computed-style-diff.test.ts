import { describe, expect, it } from 'vitest';

import { STYLE_CATEGORY_ORDER, categorizeStyles, filterStyles } from './computed-style-diff';

describe('categorizeStyles', () => {
  it('groups properties into DevTools-like categories in fixed order', () => {
    const groups = categorizeStyles({
      cursor: 'pointer',
      color: 'rgb(255, 255, 255)',
      'font-weight': '700',
      'margin-top': '8px',
      display: 'flex',
    });
    expect(groups.map((g) => g.label)).toEqual([
      'Layout',
      'Box',
      'Typography',
      'Color & background',
      'Other',
    ]);
    expect(groups[0]?.entries).toEqual([['display', 'flex']]);
    expect(groups[1]?.entries).toEqual([['margin-top', '8px']]);
    expect(groups[2]?.entries).toEqual([['font-weight', '700']]);
    expect(groups[3]?.entries).toEqual([['color', 'rgb(255, 255, 255)']]);
    expect(groups[4]?.entries).toEqual([['cursor', 'pointer']]);
  });

  it('sorts entries alphabetically within a group and omits empty groups', () => {
    const groups = categorizeStyles({ 'z-index': '10', display: 'grid', position: 'absolute' });
    expect(groups).toEqual([
      {
        label: 'Layout',
        entries: [
          ['display', 'grid'],
          ['position', 'absolute'],
          ['z-index', '10'],
        ],
      },
    ]);
  });

  it('sends border/box/outline to Box and background/opacity to Color & background', () => {
    const groups = categorizeStyles({
      'border-color': 'red',
      'box-shadow': '0 0 2px',
      'outline-width': '1px',
      'background-color': 'blue',
      opacity: '0.5',
    });
    expect(groups.map((g) => g.label)).toEqual(['Box', 'Color & background']);
    expect(groups[0]?.entries.map(([p]) => p)).toEqual([
      'border-color',
      'box-shadow',
      'outline-width',
    ]);
    expect(groups[1]?.entries.map(([p]) => p)).toEqual(['background-color', 'opacity']);
  });

  it('returns no groups for an empty diff', () => {
    expect(categorizeStyles({})).toEqual([]);
  });

  it('exposes the category order constant', () => {
    expect(STYLE_CATEGORY_ORDER).toEqual([
      'Layout',
      'Box',
      'Typography',
      'Color & background',
      'Other',
    ]);
  });
});

describe('filterStyles', () => {
  const styles = { display: 'flex', color: 'rgb(0, 0, 0)', 'margin-top': '8px' };

  it('matches property names and values, case-insensitively', () => {
    expect(filterStyles(styles, 'MAR')).toEqual({ 'margin-top': '8px' });
    expect(filterStyles(styles, 'flex')).toEqual({ display: 'flex' });
  });

  it('returns everything for an empty or whitespace query', () => {
    expect(filterStyles(styles, '')).toEqual(styles);
    expect(filterStyles(styles, '   ')).toEqual(styles);
  });

  it('returns an empty record when nothing matches', () => {
    expect(filterStyles(styles, 'zzz')).toEqual({});
  });
});
