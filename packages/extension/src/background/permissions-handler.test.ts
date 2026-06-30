import { describe, expect, it, vi } from 'vitest';

// The handler transitively imports lib/browser; stub the polyfill so the import succeeds in node.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import {
  CONTAINS_PERMISSIONS,
  REQUEST_PERMISSIONS,
  handleContainsPermissions,
  handleRequestPermissions,
  isContainsPermissionsRequest,
  isRequestPermissionsRequest,
} from './permissions-handler';

describe('isRequestPermissionsRequest', () => {
  it('accepts a well-formed request-permissions message', () => {
    expect(
      isRequestPermissionsRequest({ type: REQUEST_PERMISSIONS, permissions: ['management'] }),
    ).toBe(true);
  });

  it('rejects other message types and non-objects', () => {
    expect(isRequestPermissionsRequest({ type: 'bugcase/other' })).toBe(false);
    expect(isRequestPermissionsRequest(null)).toBe(false);
    expect(isRequestPermissionsRequest('request')).toBe(false);
  });
});

describe('handleRequestPermissions', () => {
  it('grants when the underlying request resolves true', async () => {
    const request = vi.fn(() => Promise.resolve(true));
    const res = await handleRequestPermissions(
      {
        type: REQUEST_PERMISSIONS,
        permissions: ['management'],
        origins: ['https://example.com/*'],
      },
      { request },
    );
    expect(res).toEqual({ ok: true, granted: true });
    expect(request).toHaveBeenCalledWith({
      permissions: ['management'],
      origins: ['https://example.com/*'],
    });
  });

  it('reports not granted when the user denies', async () => {
    const res = await handleRequestPermissions(
      { type: REQUEST_PERMISSIONS, permissions: ['cookies'] },
      { request: vi.fn(() => Promise.resolve(false)) },
    );
    expect(res).toEqual({ ok: true, granted: false });
  });

  it('returns ok:false with a reason when the request throws, without throwing', async () => {
    const res = await handleRequestPermissions(
      { type: REQUEST_PERMISSIONS, permissions: ['history'] },
      { request: vi.fn(() => Promise.reject(new Error('boom'))) },
    );
    expect(res.ok).toBe(false);
    expect(res.granted).toBe(false);
    expect(res.reason).toContain('boom');
  });
});

describe('isContainsPermissionsRequest', () => {
  it('accepts a well-formed contains-permissions message', () => {
    expect(
      isContainsPermissionsRequest({ type: CONTAINS_PERMISSIONS, permissions: ['cookies'] }),
    ).toBe(true);
  });

  it('rejects other message types and non-objects', () => {
    expect(isContainsPermissionsRequest({ type: REQUEST_PERMISSIONS })).toBe(false);
    expect(isContainsPermissionsRequest(null)).toBe(false);
  });
});

describe('handleContainsPermissions', () => {
  it('reports granted when the permission set is already held (no user gesture needed)', async () => {
    const has = vi.fn(() => Promise.resolve(true));
    const res = await handleContainsPermissions(
      { type: CONTAINS_PERMISSIONS, permissions: ['cookies'] },
      { has },
    );
    expect(res).toEqual({ ok: true, granted: true });
    expect(has).toHaveBeenCalledWith({ permissions: ['cookies'] });
  });

  it('reports not granted when the permission set is absent', async () => {
    const res = await handleContainsPermissions(
      { type: CONTAINS_PERMISSIONS, permissions: ['history'] },
      { has: vi.fn(() => Promise.resolve(false)) },
    );
    expect(res).toEqual({ ok: true, granted: false });
  });
});
