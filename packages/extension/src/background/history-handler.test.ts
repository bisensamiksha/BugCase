import { describe, expect, it, vi } from 'vitest';

// history-handler imports lib/browser (webextension-polyfill), which throws at import outside an
// extension; deps are injected below so the real browser API is never touched.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import type { HistoryItemLike } from '../capture/navigation-history';

import { createNavigationHistoryCollector } from './history-handler';

describe('createNavigationHistoryCollector', () => {
  it('returns null and never queries history when the permission is not granted', async () => {
    const search = vi.fn(() => Promise.resolve<readonly HistoryItemLike[]>([]));
    const collect = createNavigationHistoryCollector({
      isGranted: () => Promise.resolve(false),
      search,
    });

    await expect(collect()).resolves.toBeNull();
    expect(search).not.toHaveBeenCalled();
  });

  it('collects navigation history when the permission is granted', async () => {
    const items: HistoryItemLike[] = [
      {
        url: 'https://example.com/a',
        title: 'A',
        lastVisitTime: Date.parse('2026-06-23T11:30:00.000Z'),
      },
    ];
    const collect = createNavigationHistoryCollector({
      isGranted: () => Promise.resolve(true),
      search: () => Promise.resolve(items),
    });

    const result = await collect();
    expect(result?.entries).toHaveLength(1);
    expect(result?.entries[0]?.url).toBe('https://example.com/a');
  });

  it('resolves null without throwing when the permission check fails', async () => {
    const collect = createNavigationHistoryCollector({
      isGranted: () => Promise.reject(new Error('permissions error')),
      search: () => Promise.resolve([]),
    });
    await expect(collect()).resolves.toBeNull();
  });
});
