import { InstalledExtensionInfoSchema } from '@bugcase/schema';
import { describe, expect, it } from 'vitest';

import {
  collectInstalledExtensions,
  INSTALLED_EXTENSIONS_MAX,
  type ManagementExtensionInfoLike,
} from './installed-extensions';

describe('collectInstalledExtensions', () => {
  it('maps management items to schema-valid InstalledExtensionInfo entries', async () => {
    const items: ManagementExtensionInfoLike[] = [
      { id: 'aaa', name: 'Ad Blocker', version: '1.2.3', enabled: true, type: 'extension' },
    ];
    const result = await collectInstalledExtensions({ getAll: () => Promise.resolve(items) });

    expect(result).not.toBeNull();
    result?.forEach((e) => expect(() => InstalledExtensionInfoSchema.parse(e)).not.toThrow());
    expect(result).toEqual([
      { id: 'aaa', name: 'Ad Blocker', version: '1.2.3', enabled: true, type: 'extension' },
    ]);
  });

  it('keeps themes and apps and disabled items, recording their type', async () => {
    const items: ManagementExtensionInfoLike[] = [
      { id: 'th', name: 'Dark Theme', version: '1.0', enabled: true, type: 'theme' },
      { id: 'ap', name: 'Some App', version: '2.0', enabled: false, type: 'hosted_app' },
    ];
    const result = await collectInstalledExtensions({ getAll: () => Promise.resolve(items) });
    expect(result?.map((e) => e.type)).toEqual(['theme', 'hosted_app']); // sorted by name
    expect(result?.find((e) => e.id === 'ap')?.enabled).toBe(false);
  });

  it('excludes the extension whose id matches selfId', async () => {
    const items: ManagementExtensionInfoLike[] = [
      { id: 'self', name: 'BugCase', version: '0.0.1', enabled: true, type: 'extension' },
      { id: 'other', name: 'Other', version: '1.0', enabled: true, type: 'extension' },
    ];
    const result = await collectInstalledExtensions({
      getAll: () => Promise.resolve(items),
      selfId: 'self',
    });
    expect(result?.map((e) => e.id)).toEqual(['other']);
  });

  it('drops items missing a usable id', async () => {
    const items: ManagementExtensionInfoLike[] = [
      { name: 'No Id', version: '1.0', enabled: true, type: 'extension' },
      { id: '', name: 'Empty Id', version: '1.0', enabled: true, type: 'extension' },
      { id: 'ok', name: 'Ok', version: '1.0', enabled: true, type: 'extension' },
    ];
    const result = await collectInstalledExtensions({ getAll: () => Promise.resolve(items) });
    expect(result?.map((e) => e.id)).toEqual(['ok']);
  });

  it('defaults missing name/version/type to empty string and missing enabled to false', async () => {
    const items: ManagementExtensionInfoLike[] = [{ id: 'x' }];
    const result = await collectInstalledExtensions({ getAll: () => Promise.resolve(items) });
    expect(result?.[0]).toEqual({ id: 'x', name: '', version: '', enabled: false, type: '' });
  });

  it('sorts entries by name (case-insensitive), tiebreaking by id', async () => {
    const items: ManagementExtensionInfoLike[] = [
      { id: 'b', name: 'banana', version: '1', enabled: true, type: 'extension' },
      { id: 'a', name: 'Apple', version: '1', enabled: true, type: 'extension' },
    ];
    const result = await collectInstalledExtensions({ getAll: () => Promise.resolve(items) });
    expect(result?.map((e) => e.name)).toEqual(['Apple', 'banana']);
  });

  it('caps the number of entries at INSTALLED_EXTENSIONS_MAX', async () => {
    const items: ManagementExtensionInfoLike[] = Array.from({ length: 600 }, (_, i) => ({
      id: `id-${String(i).padStart(4, '0')}`,
      name: `ext-${String(i).padStart(4, '0')}`,
      version: '1',
      enabled: true,
      type: 'extension',
    }));
    const result = await collectInstalledExtensions({ getAll: () => Promise.resolve(items) });
    expect(result).toHaveLength(INSTALLED_EXTENSIONS_MAX);
    expect(INSTALLED_EXTENSIONS_MAX).toBe(500);
  });

  it('returns an empty array (not null) when no extensions are installed', async () => {
    const result = await collectInstalledExtensions({ getAll: () => Promise.resolve([]) });
    expect(result).toEqual([]);
  });

  it('never throws when getAll rejects, resolving null', async () => {
    await expect(
      collectInstalledExtensions({ getAll: () => Promise.reject(new Error('management failed')) }),
    ).resolves.toBeNull();
  });
});
