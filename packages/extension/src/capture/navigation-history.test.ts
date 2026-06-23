import { NavigationLogSchema } from '@bugcase/schema';
import { describe, expect, it, vi } from 'vitest';

import {
  collectNavigationHistory,
  NAVIGATION_HISTORY_MAX_RESULTS,
  NAVIGATION_HISTORY_WINDOW_MS,
  type HistoryItemLike,
  type HistorySearchQuery,
} from './navigation-history';

const FIXED_NOW = Date.parse('2026-06-23T12:00:00.000Z');
const now = (): number => FIXED_NOW;

describe('collectNavigationHistory', () => {
  it('maps history items to schema-valid navigation entries', async () => {
    const items: HistoryItemLike[] = [
      {
        url: 'https://example.com/a',
        title: 'A',
        lastVisitTime: Date.parse('2026-06-23T11:30:00.000Z'),
      },
    ];
    const result = await collectNavigationHistory({ search: () => Promise.resolve(items), now });

    expect(result).not.toBeNull();
    expect(() => NavigationLogSchema.parse(result)).not.toThrow();
    expect(result?.entries).toEqual([
      { url: 'https://example.com/a', title: 'A', visitedAt: '2026-06-23T11:30:00.000Z' },
    ]);
  });

  it('queries a 60-minute window capped at the max results', async () => {
    const search = vi.fn((_q: HistorySearchQuery) =>
      Promise.resolve<readonly HistoryItemLike[]>([]),
    );
    await collectNavigationHistory({ search, now });

    expect(search).toHaveBeenCalledWith({
      text: '',
      startTime: FIXED_NOW - NAVIGATION_HISTORY_WINDOW_MS,
      maxResults: NAVIGATION_HISTORY_MAX_RESULTS,
    });
    expect(NAVIGATION_HISTORY_WINDOW_MS).toBe(60 * 60 * 1000);
    expect(NAVIGATION_HISTORY_MAX_RESULTS).toBe(50);
  });

  it('masks JWT secrets embedded in URLs', async () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123def';
    const items: HistoryItemLike[] = [
      { url: `https://example.com/cb#access_token=${jwt}`, title: 'cb', lastVisitTime: FIXED_NOW },
    ];
    const result = await collectNavigationHistory({ search: () => Promise.resolve(items), now });

    expect(result?.entries[0]?.url).not.toContain(jwt);
    expect(result?.entries[0]?.url).toContain('[scrubbed]');
  });

  it('returns an empty log (not null) when the window has no visits', async () => {
    const result = await collectNavigationHistory({ search: () => Promise.resolve([]), now });
    expect(result).toEqual({ schemaVersion: 'v1', entries: [] });
  });

  it('drops items missing a url or a valid lastVisitTime', async () => {
    const items: HistoryItemLike[] = [
      { title: 'no url', lastVisitTime: FIXED_NOW },
      { url: 'https://example.com/b' },
      { url: 'https://example.com/c', lastVisitTime: Number.NaN },
      { url: 'https://example.com/d', title: 'D', lastVisitTime: FIXED_NOW },
    ];
    const result = await collectNavigationHistory({ search: () => Promise.resolve(items), now });
    expect(result?.entries).toEqual([
      { url: 'https://example.com/d', title: 'D', visitedAt: new Date(FIXED_NOW).toISOString() },
    ]);
  });

  it('defaults a missing title to an empty string', async () => {
    const items: HistoryItemLike[] = [{ url: 'https://example.com/x', lastVisitTime: FIXED_NOW }];
    const result = await collectNavigationHistory({ search: () => Promise.resolve(items), now });
    expect(result?.entries[0]?.title).toBe('');
  });

  it('sorts entries most-recent-first', async () => {
    const older = Date.parse('2026-06-23T11:00:00.000Z');
    const newer = Date.parse('2026-06-23T11:45:00.000Z');
    const items: HistoryItemLike[] = [
      { url: 'https://example.com/old', title: 'old', lastVisitTime: older },
      { url: 'https://example.com/new', title: 'new', lastVisitTime: newer },
    ];
    const result = await collectNavigationHistory({ search: () => Promise.resolve(items), now });
    expect(result?.entries.map((e) => e.title)).toEqual(['new', 'old']);
  });

  it('never throws when the history search rejects, resolving null', async () => {
    const search = vi.fn(() => Promise.reject(new Error('history.search failed')));
    await expect(collectNavigationHistory({ search })).resolves.toBeNull();
  });
});
