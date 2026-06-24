import { describe, expect, it, vi } from 'vitest';

// cookies-handler imports lib/browser (webextension-polyfill), which throws at import outside an
// extension; deps are injected below so the real browser API is never touched.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import type { CookieLike } from '../capture/cookies';

import { createCookiesCollector } from './cookies-handler';

const URL = 'https://example.com/path';

describe('createCookiesCollector', () => {
  it('returns null and never calls getAll when the permission is not granted', async () => {
    const getAll = vi.fn(() => Promise.resolve<readonly CookieLike[]>([]));
    const collect = createCookiesCollector({ isGranted: () => Promise.resolve(false), getAll });

    await expect(collect(URL)).resolves.toBeNull();
    expect(getAll).not.toHaveBeenCalled();
  });

  it('returns null and never calls getAll when the url is empty', async () => {
    const getAll = vi.fn(() => Promise.resolve<readonly CookieLike[]>([]));
    const collect = createCookiesCollector({ isGranted: () => Promise.resolve(true), getAll });

    await expect(collect('')).resolves.toBeNull();
    expect(getAll).not.toHaveBeenCalled();
  });

  it('collects cookies for the captured url when the permission is granted', async () => {
    const getAll = vi.fn(() =>
      Promise.resolve<readonly CookieLike[]>([
        { name: 'sid', value: 'secret', domain: 'example.com', path: '/' },
      ]),
    );
    const collect = createCookiesCollector({ isGranted: () => Promise.resolve(true), getAll });

    const dump = await collect(URL);
    expect(getAll).toHaveBeenCalledWith(URL);
    expect(dump?.entries).toHaveLength(1);
    // Value masked by the collector — the raw secret never survives.
    expect(dump?.entries[0]?.value).not.toBe('secret');
    expect(dump?.entries[0]?.masked).toBe(true);
  });

  it('resolves null without throwing when the permission check fails', async () => {
    const collect = createCookiesCollector({
      isGranted: () => Promise.reject(new Error('permissions error')),
      getAll: () => Promise.resolve([]),
    });
    await expect(collect(URL)).resolves.toBeNull();
  });

  it('resolves null without throwing when getAll rejects', async () => {
    const collect = createCookiesCollector({
      isGranted: () => Promise.resolve(true),
      getAll: () => Promise.reject(new Error('cookies.getAll failed')),
    });
    await expect(collect(URL)).resolves.toBeNull();
  });
});
