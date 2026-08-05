import type { CookieEntry, StorageEntry } from '@bugcase/schema';
import { describe, expect, it } from 'vitest';

import { cookieRows, cookieSummary, storageRows, storageSummary } from './storage-tables';

function cookie(over: Partial<CookieEntry>): CookieEntry {
  return {
    name: 'session_id',
    value: 'abc',
    domain: '.app.com',
    path: '/',
    expiresAt: '2026-08-01T00:00:00.000Z',
    httpOnly: false,
    secure: false,
    sameSite: 'unspecified',
    session: false,
    masked: false,
    ...over,
  };
}

const LS: readonly StorageEntry[] = [
  { key: 'feature_flags', value: '{"a":1}', sizeBytes: 1300 },
  { key: 'user_prefs', value: 'dark', sizeBytes: 340 },
];

describe('cookieRows', () => {
  it('maps fields and present-only flags', () => {
    const [row] = cookieRows(
      [cookie({ httpOnly: true, secure: true, sameSite: 'lax', masked: true })],
      '',
    );
    expect(row?.name).toBe('session_id');
    expect(row?.flags).toEqual(['HttpOnly', 'Secure', 'SameSite=Lax', 'Masked']);
    expect(row?.masked).toBe(true);
  });

  it('shows "Session" for session cookies and raw expiresAt otherwise', () => {
    expect(cookieRows([cookie({ session: true })], '')[0]?.expires).toBe('Session');
    expect(cookieRows([cookie({ session: false })], '')[0]?.expires).toBe(
      '2026-08-01T00:00:00.000Z',
    );
    expect(cookieRows([cookie({ session: false, expiresAt: null })], '')[0]?.expires).toBe(
      'Not recorded',
    );
  });

  it('filters case-insensitively on name', () => {
    const entries = [cookie({ name: 'session_id' }), cookie({ name: 'theme' })];
    expect(cookieRows(entries, 'THEME').map((r) => r.name)).toEqual(['theme']);
    expect(cookieRows(entries, '').length).toBe(2);
  });
});

describe('storageRows', () => {
  it('maps size and filters on key', () => {
    const rows = storageRows(LS, 'flags');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).toBe('feature_flags');
    expect(rows[0]?.size).toBe('1.3 KB');
  });
});

describe('summaries', () => {
  it('pluralizes cookies', () => {
    expect(cookieSummary([])).toBe('0 cookies');
    expect(cookieSummary([cookie({})])).toBe('1 cookie');
  });

  it('totals storage bytes over the full list', () => {
    expect(storageSummary(LS)).toBe('2 keys · 1.6 KB');
    expect(storageSummary([LS[0]!])).toBe('1 key · 1.3 KB');
  });
});
