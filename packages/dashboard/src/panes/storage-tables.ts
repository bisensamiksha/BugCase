import type { CookieEntry, StorageEntry } from '@bugcase/schema';

import { formatByteSize } from '../lib/format-bytes';

/** Display row for one cookie; `id` keys the reveal Set, `flags` are present-only badges. */
export interface CookieRow {
  readonly id: string;
  readonly name: string;
  readonly value: string;
  readonly masked: boolean;
  readonly domain: string;
  readonly path: string;
  readonly expires: string;
  readonly flags: readonly string[];
}

/** Display row for one localStorage/sessionStorage entry. */
export interface StorageRow {
  readonly id: string;
  readonly key: string;
  readonly value: string;
  readonly sizeBytes: number;
  readonly size: string;
}

function matches(haystack: string, filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  return needle.length === 0 || haystack.toLowerCase().includes(needle);
}

function cookieFlags(entry: CookieEntry): string[] {
  const flags: string[] = [];
  if (entry.httpOnly) {
    flags.push('HttpOnly');
  }
  if (entry.secure) {
    flags.push('Secure');
  }
  if (entry.sameSite !== 'unspecified') {
    flags.push(`SameSite=${entry.sameSite.charAt(0).toUpperCase()}${entry.sameSite.slice(1)}`);
  }
  if (entry.session) {
    flags.push('Session');
  }
  if (entry.masked) {
    flags.push('Masked');
  }
  return flags;
}

/** Map + name-filter cookies. `expires` is the raw ISO string (deterministic, byte-faithful). */
export function cookieRows(entries: readonly CookieEntry[], filter: string): CookieRow[] {
  return entries
    .map(
      (entry, index): CookieRow => ({
        id: `${entry.name} ${entry.domain} ${entry.path} ${index}`,
        name: entry.name,
        value: entry.value,
        masked: entry.masked,
        domain: entry.domain,
        path: entry.path,
        expires: entry.session ? 'Session' : (entry.expiresAt ?? '-'),
        flags: cookieFlags(entry),
      }),
    )
    .filter((row) => matches(row.name, filter));
}

/** Map + key-filter storage entries. */
export function storageRows(entries: readonly StorageEntry[], filter: string): StorageRow[] {
  return entries
    .map(
      (entry, index): StorageRow => ({
        id: `${entry.key} ${index}`,
        key: entry.key,
        value: entry.value,
        sizeBytes: entry.sizeBytes,
        size: formatByteSize(entry.sizeBytes),
      }),
    )
    .filter((row) => matches(row.key, filter));
}

/** Caption summary for cookies (count only — cookies carry no per-entry byte size). */
export function cookieSummary(entries: readonly CookieEntry[]): string {
  const n = entries.length;
  return `${n} ${n === 1 ? 'cookie' : 'cookies'}`;
}

/** Caption summary for a storage section: key count + total size over the FULL (unfiltered) list. */
export function storageSummary(entries: readonly StorageEntry[]): string {
  const n = entries.length;
  const total = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  return `${n} ${n === 1 ? 'key' : 'keys'} · ${formatByteSize(total)}`;
}
