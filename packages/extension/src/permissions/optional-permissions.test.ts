import { describe, expect, it, vi } from 'vitest';

// optional-permissions imports lib/browser for its default API; stub the polyfill so import succeeds.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import {
  hasOptionalPermissions,
  removeOptionalPermissions,
  requestOptionalPermissions,
  type PermissionsApi,
} from './optional-permissions';

function fakeApi(overrides: Partial<PermissionsApi> = {}): PermissionsApi {
  return {
    request: vi.fn(() => Promise.resolve(true)),
    contains: vi.fn(() => Promise.resolve(true)),
    remove: vi.fn(() => Promise.resolve(true)),
    ...overrides,
  };
}

describe('requestOptionalPermissions', () => {
  it('requests the given permissions and origins and resolves the grant result', async () => {
    const request = vi.fn(() => Promise.resolve(true));
    const granted = await requestOptionalPermissions(
      { permissions: ['management'], origins: ['https://example.com/*'] },
      { permissions: fakeApi({ request }) },
    );
    expect(granted).toBe(true);
    expect(request).toHaveBeenCalledWith({
      permissions: ['management'],
      origins: ['https://example.com/*'],
    });
  });

  it('resolves false when the user denies', async () => {
    const api = fakeApi({ request: vi.fn(() => Promise.resolve(false)) });
    expect(
      await requestOptionalPermissions({ permissions: ['cookies'] }, { permissions: api }),
    ).toBe(false);
  });

  it('resolves false (no throw) when the browser rejects, e.g. no user gesture', async () => {
    const api = fakeApi({
      request: vi.fn(() => Promise.reject(new Error('must be called during a user gesture'))),
    });
    expect(
      await requestOptionalPermissions({ permissions: ['history'] }, { permissions: api }),
    ).toBe(false);
  });

  it('resolves false without calling the browser for an empty request', async () => {
    const request = vi.fn(() => Promise.resolve(true));
    expect(await requestOptionalPermissions({}, { permissions: fakeApi({ request }) })).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
});

describe('hasOptionalPermissions', () => {
  it('returns whether the permission set is already granted', async () => {
    const contains = vi.fn(() => Promise.resolve(true));
    expect(
      await hasOptionalPermissions(
        { permissions: ['cookies'] },
        { permissions: fakeApi({ contains }) },
      ),
    ).toBe(true);
    expect(contains).toHaveBeenCalledWith({ permissions: ['cookies'] });
  });

  it('returns false (no throw) when the query rejects', async () => {
    const api = fakeApi({ contains: vi.fn(() => Promise.reject(new Error('x'))) });
    expect(await hasOptionalPermissions({ permissions: ['cookies'] }, { permissions: api })).toBe(
      false,
    );
  });
});

describe('removeOptionalPermissions', () => {
  it('removes the given permission set', async () => {
    const remove = vi.fn(() => Promise.resolve(true));
    expect(
      await removeOptionalPermissions(
        { permissions: ['management'] },
        { permissions: fakeApi({ remove }) },
      ),
    ).toBe(true);
    expect(remove).toHaveBeenCalledWith({ permissions: ['management'] });
  });

  it('resolves false for an empty request without calling the browser', async () => {
    const remove = vi.fn(() => Promise.resolve(true));
    expect(await removeOptionalPermissions({}, { permissions: fakeApi({ remove }) })).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });
});
