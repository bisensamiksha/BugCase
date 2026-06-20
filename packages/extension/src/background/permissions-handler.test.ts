import { describe, expect, it, vi } from 'vitest';

// The handler transitively imports lib/browser; stub the polyfill so the import succeeds in node.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import {
  REQUEST_PERMISSIONS,
  handleRequestPermissions,
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
