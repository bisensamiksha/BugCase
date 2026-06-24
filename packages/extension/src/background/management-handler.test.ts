import { describe, expect, it, vi } from 'vitest';

// management-handler imports lib/browser (webextension-polyfill), which throws at import outside an
// extension; deps are injected below so the real browser API is never touched.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import type { ManagementExtensionInfoLike } from '../capture/installed-extensions';

import { createInstalledExtensionsCollector } from './management-handler';

describe('createInstalledExtensionsCollector', () => {
  it('returns null and never calls getAll when the permission is not granted', async () => {
    const getAll = vi.fn(() => Promise.resolve<readonly ManagementExtensionInfoLike[]>([]));
    const collect = createInstalledExtensionsCollector({
      isGranted: () => Promise.resolve(false),
      getAll,
    });

    await expect(collect()).resolves.toBeNull();
    expect(getAll).not.toHaveBeenCalled();
  });

  it('collects and excludes self when the permission is granted', async () => {
    const items: ManagementExtensionInfoLike[] = [
      { id: 'self', name: 'BugCase', version: '0.0.1', enabled: true, type: 'extension' },
      { id: 'other', name: 'Other', version: '1.0', enabled: true, type: 'extension' },
    ];
    const collect = createInstalledExtensionsCollector({
      isGranted: () => Promise.resolve(true),
      getAll: () => Promise.resolve(items),
      selfId: 'self',
    });

    const result = await collect();
    expect(result).toHaveLength(1);
    expect(result?.[0]?.id).toBe('other');
  });

  it('resolves null without throwing when the permission check fails', async () => {
    const collect = createInstalledExtensionsCollector({
      isGranted: () => Promise.reject(new Error('permissions error')),
      getAll: () => Promise.resolve([]),
    });
    await expect(collect()).resolves.toBeNull();
  });

  it('resolves null without throwing when getAll rejects', async () => {
    const collect = createInstalledExtensionsCollector({
      isGranted: () => Promise.resolve(true),
      getAll: () => Promise.reject(new Error('management.getAll failed')),
    });
    await expect(collect()).resolves.toBeNull();
  });
});
