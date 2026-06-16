import { describe, expect, it, vi } from 'vitest';

// The handler transitively imports lib/browser; stub the polyfill so the import succeeds in node.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import {
  ORIGIN_ALLOWLIST_MESSAGE,
  handleOriginAllowlist,
  isOriginAllowlistRequest,
} from './origin-allowlist-handler';

describe('isOriginAllowlistRequest', () => {
  it('accepts a well-formed allowlist message', () => {
    expect(
      isOriginAllowlistRequest({
        type: ORIGIN_ALLOWLIST_MESSAGE,
        action: 'add',
        origin: 'https://a.com',
      }),
    ).toBe(true);
  });

  it('rejects other message types and non-objects', () => {
    expect(isOriginAllowlistRequest({ type: 'bugcase/other' })).toBe(false);
    expect(isOriginAllowlistRequest(null)).toBe(false);
    expect(isOriginAllowlistRequest('allowlist')).toBe(false);
  });
});

describe('handleOriginAllowlist', () => {
  it('returns the full list for a get action', async () => {
    const getAllowed = vi.fn(() => Promise.resolve(['https://a.com', 'https://b.com']));
    const res = await handleOriginAllowlist(
      { type: ORIGIN_ALLOWLIST_MESSAGE, action: 'get' },
      { getAllowed },
    );
    expect(res).toEqual({ ok: true, origins: ['https://a.com', 'https://b.com'] });
  });

  it('reports membership for an isAllowed action', async () => {
    const isAllowed = vi.fn(() => Promise.resolve(true));
    const res = await handleOriginAllowlist(
      { type: ORIGIN_ALLOWLIST_MESSAGE, action: 'isAllowed', origin: 'https://a.com' },
      { isAllowed },
    );
    expect(isAllowed).toHaveBeenCalledWith('https://a.com');
    expect(res.ok).toBe(true);
    expect(res.allowed).toBe(true);
  });

  it('returns the new list after an add action', async () => {
    const add = vi.fn(() => Promise.resolve(['https://a.com']));
    const res = await handleOriginAllowlist(
      { type: ORIGIN_ALLOWLIST_MESSAGE, action: 'add', origin: 'https://a.com' },
      { add },
    );
    expect(add).toHaveBeenCalledWith('https://a.com');
    expect(res).toEqual({ ok: true, origins: ['https://a.com'] });
  });

  it('returns the new list after a remove action', async () => {
    const remove = vi.fn(() => Promise.resolve([]));
    const res = await handleOriginAllowlist(
      { type: ORIGIN_ALLOWLIST_MESSAGE, action: 'remove', origin: 'https://a.com' },
      { remove },
    );
    expect(remove).toHaveBeenCalledWith('https://a.com');
    expect(res).toEqual({ ok: true, origins: [] });
  });

  it('reports ok:false with a reason when an origin-scoped action omits the origin', async () => {
    const res = await handleOriginAllowlist({ type: ORIGIN_ALLOWLIST_MESSAGE, action: 'add' }, {});
    expect(res.ok).toBe(false);
    expect(res.origins).toEqual([]);
    expect(res.reason).toMatch(/origin/i);
  });

  it('returns ok:false with a reason when a dependency throws, without throwing', async () => {
    const res = await handleOriginAllowlist(
      { type: ORIGIN_ALLOWLIST_MESSAGE, action: 'get' },
      { getAllowed: vi.fn(() => Promise.reject(new Error('boom'))) },
    );
    expect(res.ok).toBe(false);
    expect(res.origins).toEqual([]);
    expect(res.reason).toContain('boom');
  });
});
