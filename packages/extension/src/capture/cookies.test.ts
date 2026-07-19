import { CookieEntrySchema, CookiesDumpSchema, SCRUBBED_VALUE_PLACEHOLDER } from '@bugcase/schema';
import { describe, expect, it } from 'vitest';

import { collectCookies, COOKIES_MAX, type CookieLike } from './cookies';

describe('collectCookies', () => {
  it('surfaces the cookie scrubber per-rule summary alongside the dump', async () => {
    const result = await collectCookies({
      getAll: () => Promise.resolve([{ name: 'sid', value: 'secret', domain: 'a.com', path: '/' }]),
    });
    expect(result).not.toBeNull();
    expect(result!.cookies.entries[0]!.masked).toBe(true);
    expect(result!.scrubbersApplied.length).toBeGreaterThan(0);
    expect(result!.scrubbersApplied[0]!.hits).toBeGreaterThan(0);
  });

  it('maps a chrome cookie into a schema-valid entry with the value masked by default', async () => {
    const items: CookieLike[] = [
      {
        name: 'session_id',
        value: 'super-secret-token',
        domain: 'example.com',
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'lax',
        session: false,
        expirationDate: 1_800_000_000, // seconds since epoch
      },
    ];
    const dump = (await collectCookies({ getAll: () => Promise.resolve(items) }))?.cookies ?? null;

    expect(dump).not.toBeNull();
    expect(() => CookiesDumpSchema.parse(dump)).not.toThrow();
    dump?.entries.forEach((e) => expect(() => CookieEntrySchema.parse(e)).not.toThrow());

    const entry = dump?.entries[0];
    expect(entry).toEqual({
      name: 'session_id',
      value: SCRUBBED_VALUE_PLACEHOLDER,
      domain: 'example.com',
      path: '/',
      expiresAt: new Date(1_800_000_000 * 1000).toISOString(),
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      session: false,
      masked: true,
    });
    // The raw value must never survive into the report.
    expect(entry?.value).not.toContain('super-secret-token');
  });

  it('treats a cookie with no expirationDate as a session cookie (expiresAt null)', async () => {
    const items: CookieLike[] = [{ name: 'tmp', value: 'v', domain: 'example.com', path: '/' }];
    const dump = (await collectCookies({ getAll: () => Promise.resolve(items) }))?.cookies ?? null;
    expect(dump?.entries[0]?.session).toBe(true);
    expect(dump?.entries[0]?.expiresAt).toBeNull();
  });

  it('maps chrome sameSite "no_restriction" to "none" and unknown values to "unspecified"', async () => {
    const items: CookieLike[] = [
      { name: 'a', value: 'x', domain: 'a.com', path: '/', sameSite: 'no_restriction' },
      { name: 'b', value: 'x', domain: 'b.com', path: '/', sameSite: 'weird-value' },
      { name: 'c', value: 'x', domain: 'c.com', path: '/' },
    ];
    const dump = (await collectCookies({ getAll: () => Promise.resolve(items) }))?.cookies ?? null;
    expect(dump?.entries.map((e) => e.sameSite)).toEqual(['none', 'unspecified', 'unspecified']);
  });

  it('drops an out-of-range expirationDate to expiresAt null instead of throwing', async () => {
    const items: CookieLike[] = [
      { name: 'a', value: 'x', domain: 'a.com', path: '/', session: false, expirationDate: 1e308 },
    ];
    const dump = (await collectCookies({ getAll: () => Promise.resolve(items) }))?.cookies ?? null;
    expect(dump?.entries[0]?.expiresAt).toBeNull();
  });

  it('leaves an empty cookie value unmasked (nothing to mask)', async () => {
    const items: CookieLike[] = [{ name: 'empty', value: '', domain: 'a.com', path: '/' }];
    const dump = (await collectCookies({ getAll: () => Promise.resolve(items) }))?.cookies ?? null;
    expect(dump?.entries[0]?.value).toBe('');
    expect(dump?.entries[0]?.masked).toBe(false);
  });

  it('defaults missing string/boolean fields safely', async () => {
    const items: CookieLike[] = [{}];
    const dump = (await collectCookies({ getAll: () => Promise.resolve(items) }))?.cookies ?? null;
    expect(dump?.entries[0]).toEqual({
      name: '',
      value: '',
      domain: '',
      path: '',
      expiresAt: null,
      httpOnly: false,
      secure: false,
      sameSite: 'unspecified',
      session: true,
      masked: false,
    });
  });

  it('sorts entries by domain, then name, then path', async () => {
    const items: CookieLike[] = [
      { name: 'b', value: 'x', domain: 'b.com', path: '/' },
      { name: 'a', value: 'x', domain: 'a.com', path: '/z' },
      { name: 'a', value: 'x', domain: 'a.com', path: '/a' },
    ];
    const dump = (await collectCookies({ getAll: () => Promise.resolve(items) }))?.cookies ?? null;
    expect(dump?.entries.map((e) => `${e.domain}${e.path}`)).toEqual([
      'a.com/a',
      'a.com/z',
      'b.com/',
    ]);
  });

  it('caps the number of entries at COOKIES_MAX', async () => {
    const items: CookieLike[] = Array.from({ length: COOKIES_MAX + 50 }, (_, i) => ({
      name: `c-${String(i).padStart(4, '0')}`,
      value: 'x',
      domain: 'example.com',
      path: '/',
    }));
    const dump = (await collectCookies({ getAll: () => Promise.resolve(items) }))?.cookies ?? null;
    expect(dump?.entries).toHaveLength(COOKIES_MAX);
    expect(COOKIES_MAX).toBe(500);
  });

  it('returns an empty dump (not null) when there are no cookies', async () => {
    const dump = (await collectCookies({ getAll: () => Promise.resolve([]) }))?.cookies ?? null;
    expect(dump).toEqual({ schemaVersion: 'v1', entries: [] });
  });

  it('never throws when getAll rejects, resolving null', async () => {
    await expect(
      collectCookies({ getAll: () => Promise.reject(new Error('cookies.getAll failed')) }),
    ).resolves.toBeNull();
  });
});
