import { describe, expect, it } from 'vitest';

import {
  DASHBOARD_PANES,
  PANE_LABELS,
  formatHash,
  parseHash,
  type DashboardPane,
} from './hash-router';

describe('DASHBOARD_PANES / PANE_LABELS', () => {
  it('lists all eight panes with overview first', () => {
    expect(DASHBOARD_PANES).toEqual([
      'overview',
      'screenshots',
      'console',
      'network',
      'dom',
      'reproduction',
      'storage',
      'privacy',
    ]);
  });

  it('parses and formats the reproduction pane route (S4-10)', () => {
    expect(parseHash('#/reproduction/abc-123')).toEqual({
      activePane: 'reproduction',
      reportId: 'abc-123',
    });
    expect(formatHash({ activePane: 'reproduction', reportId: 'abc-123' })).toBe(
      '#/reproduction/abc-123',
    );
    expect(PANE_LABELS.reproduction).toBe('Reproduction');
  });

  it('has a non-empty label for every pane', () => {
    for (const pane of DASHBOARD_PANES) {
      expect(PANE_LABELS[pane]).toBeTruthy();
    }
  });
});

describe('parseHash', () => {
  it('defaults to the overview pane for an empty hash', () => {
    expect(parseHash('')).toEqual({ activePane: 'overview', reportId: null });
  });

  it('defaults to overview for a bare "#" or "#/"', () => {
    expect(parseHash('#')).toEqual({ activePane: 'overview', reportId: null });
    expect(parseHash('#/')).toEqual({ activePane: 'overview', reportId: null });
  });

  it('parses a known pane', () => {
    expect(parseHash('#/console')).toEqual({ activePane: 'console', reportId: null });
    expect(parseHash('#/network')).toEqual({ activePane: 'network', reportId: null });
  });

  it('tolerates a missing leading "#"', () => {
    expect(parseHash('/storage')).toEqual({ activePane: 'storage', reportId: null });
    expect(parseHash('privacy')).toEqual({ activePane: 'privacy', reportId: null });
  });

  it('falls back to overview for an unknown pane', () => {
    expect(parseHash('#/bogus')).toEqual({ activePane: 'overview', reportId: null });
  });

  it('URL-decodes a report id from the second segment', () => {
    expect(parseHash('#/network/abc%20123')).toEqual({
      activePane: 'network',
      reportId: 'abc 123',
    });
  });

  it('treats a trailing slash / empty id segment as no report id', () => {
    expect(parseHash('#/privacy/')).toEqual({ activePane: 'privacy', reportId: null });
  });

  it('returns a null report id (never throws) for a malformed percent-encoding', () => {
    expect(parseHash('#/console/%E0%A4%A')).toEqual({ activePane: 'console', reportId: null });
  });
});

describe('formatHash', () => {
  it('formats a pane without a report id', () => {
    expect(formatHash({ activePane: 'overview', reportId: null })).toBe('#/overview');
    expect(formatHash({ activePane: 'console', reportId: null })).toBe('#/console');
  });

  it('URL-encodes a report id in the second segment', () => {
    expect(formatHash({ activePane: 'network', reportId: 'a b/c' })).toBe('#/network/a%20b%2Fc');
  });
});

describe('query params (S4-09 open-at-element deep-link seam)', () => {
  it('parses a ?el= query into params, after the report id', () => {
    expect(parseHash('#/dom/rep-1?el=%23login')).toEqual({
      activePane: 'dom',
      reportId: 'rep-1',
      params: { el: '#login' },
    });
  });

  it('parses a query on a pane with no report id', () => {
    expect(parseHash('#/dom?el=.btn')).toEqual({
      activePane: 'dom',
      reportId: null,
      params: { el: '.btn' },
    });
  });

  it('omits params entirely when the hash has no query (existing URLs unaffected)', () => {
    expect(parseHash('#/console/rep-1').params).toBeUndefined();
    expect(parseHash('#/dom?').params).toBeUndefined();
  });

  it('never throws on a malformed query', () => {
    expect(() => parseHash('#/dom/r?el=%E0%A4%A')).not.toThrow();
    expect(parseHash('#/dom/r?el=%E0%A4%A').activePane).toBe('dom');
  });

  it('formatHash appends an encoded query only when params are non-empty', () => {
    expect(formatHash({ activePane: 'dom', reportId: 'rep-1', params: { el: '#login' } })).toBe(
      '#/dom/rep-1?el=%23login',
    );
    expect(formatHash({ activePane: 'dom', reportId: 'rep-1', params: {} })).toBe('#/dom/rep-1');
  });

  it('round-trips a selector with reserved characters through the el param', () => {
    const state = {
      activePane: 'dom',
      reportId: 'id with/slash',
      params: { el: 'main > .card[data-x="1"] #login' },
    } as const;
    expect(parseHash(formatHash(state))).toEqual(state);
  });
});

describe('parseHash / formatHash round-trip', () => {
  it('round-trips every pane with no report id', () => {
    for (const pane of DASHBOARD_PANES) {
      const state = { activePane: pane, reportId: null } as const;
      expect(parseHash(formatHash(state))).toEqual(state);
    }
  });

  it('round-trips a report id containing reserved characters', () => {
    const state: { activePane: DashboardPane; reportId: string } = {
      activePane: 'screenshots',
      reportId: 'id with/slash & space',
    };
    expect(parseHash(formatHash(state))).toEqual(state);
  });
});
