import type { BugReportV1 } from '@bugcase/schema';
import { describe, expect, it } from 'vitest';

import {
  addReportTab,
  closeReportTab,
  findTab,
  makeReportTab,
  neighborTabId,
  reorderReportTabs,
  type ReportTab,
} from './report-tabs';

const report = (id: string, page?: Partial<{ title: string; origin: string }>): BugReportV1 =>
  ({
    schemaVersion: 'v1',
    metadata: {
      id,
      page: page ? { title: page.title ?? null, origin: page.origin ?? null } : undefined,
    },
  }) as unknown as BugReportV1;

const tab = (id: string, label = id): ReportTab => ({ id, label, report: report(id) });

describe('makeReportTab', () => {
  it('uses metadata.id as the tab id and page.title as the label', () => {
    const t = makeReportTab(report('abc', { title: 'Checkout page' }));
    expect(t.id).toBe('abc');
    expect(t.label).toBe('Checkout page');
  });

  it('falls back label to origin, then the source filename, then "Report"', () => {
    expect(makeReportTab(report('a', { origin: 'https://example.com' })).label).toBe(
      'https://example.com',
    );
    expect(makeReportTab(report('b'), 'crash.zip').label).toBe('crash.zip');
    expect(makeReportTab(report('c')).label).toBe('Report');
  });

  it('never throws on a report missing metadata; still yields a non-empty id', () => {
    const t = makeReportTab({ schemaVersion: 'v1' } as unknown as BugReportV1, 'x.zip');
    expect(typeof t.id).toBe('string');
    expect(t.id.length).toBeGreaterThan(0);
    expect(t.label).toBe('x.zip');
  });
});

describe('addReportTab', () => {
  it('appends a new tab', () => {
    const tabs = addReportTab([tab('a')], tab('b'));
    expect(tabs.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('dedupes by id — the existing tab wins, no duplicate is added', () => {
    const existing = tab('a', 'original');
    const tabs = addReportTab([existing], tab('a', 'replacement'));
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.label).toBe('original');
  });
});

describe('closeReportTab', () => {
  it('removes the tab with the given id', () => {
    expect(closeReportTab([tab('a'), tab('b')], 'a').map((t) => t.id)).toEqual(['b']);
  });

  it('leaves the list unchanged for an unknown id', () => {
    const tabs = [tab('a')];
    expect(closeReportTab(tabs, 'zzz')).toEqual(tabs);
  });
});

describe('reorderReportTabs', () => {
  it('moves a tab before the target (last → first)', () => {
    const tabs = [tab('a'), tab('b'), tab('c')];
    expect(reorderReportTabs(tabs, 'c', 'a').map((t) => t.id)).toEqual(['c', 'a', 'b']);
  });

  it('moves a tab before the target (first → before last)', () => {
    const tabs = [tab('a'), tab('b'), tab('c')];
    expect(reorderReportTabs(tabs, 'a', 'c').map((t) => t.id)).toEqual(['b', 'a', 'c']);
  });

  it('is a no-op for unknown ids or a self-move', () => {
    const tabs = [tab('a'), tab('b')];
    expect(reorderReportTabs(tabs, 'a', 'a')).toEqual(tabs);
    expect(reorderReportTabs(tabs, 'a', 'zzz')).toEqual(tabs);
  });
});

describe('neighborTabId', () => {
  it('returns the next tab when closing a middle tab', () => {
    expect(neighborTabId([tab('a'), tab('b'), tab('c')], 'b')).toBe('c');
  });

  it('returns the previous tab when closing the last tab', () => {
    expect(neighborTabId([tab('a'), tab('b'), tab('c')], 'c')).toBe('b');
  });

  it('returns null when closing the only tab, or for an unknown id', () => {
    expect(neighborTabId([tab('a')], 'a')).toBeNull();
    expect(neighborTabId([tab('a')], 'zzz')).toBeNull();
  });
});

describe('findTab', () => {
  it('finds a tab by id and returns undefined for null / missing', () => {
    const tabs = [tab('a'), tab('b')];
    expect(findTab(tabs, 'b')?.id).toBe('b');
    expect(findTab(tabs, null)).toBeUndefined();
    expect(findTab(tabs, 'zzz')).toBeUndefined();
  });
});
