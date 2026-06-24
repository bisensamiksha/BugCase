/**
 * Cookies collector (S2-17).
 *
 * Maps `chrome.cookies.getAll({ url })` results into the report's {@link CookiesDump}, then runs the
 * S2-09 {@link scrubCookies} rule so every cookie value is masked by default — raw values never reach
 * the report. Pure and dependency-injected (the real `cookies.getAll` is supplied by
 * `background/cookies-handler.ts`) so it is unit-testable without the browser, mirroring the S2-15/
 * S2-16 collectors. Never throws: a rejected `getAll` resolves to `null`.
 */

import {
  scrubCookies,
  type CookieEntry,
  type CookieSameSite,
  type CookiesDump,
} from '@bugcase/schema';

/** Defensive upper bound on entries recorded (a single origin's cookie set is small; this caps pathology). */
export const COOKIES_MAX = 500;

/** Subset of `chrome.cookies.Cookie` the collector reads (all fields best-effort). */
export interface CookieLike {
  readonly name?: string;
  readonly value?: string;
  readonly domain?: string;
  readonly path?: string;
  readonly secure?: boolean;
  readonly httpOnly?: boolean;
  /** `chrome.cookies.SameSiteStatus`: 'no_restriction' | 'lax' | 'strict' | 'unspecified'. */
  readonly sameSite?: string;
  readonly session?: boolean;
  /** Seconds since the UNIX epoch; absent for session cookies. */
  readonly expirationDate?: number;
}

export interface CollectCookiesDeps {
  /** Lists cookies for the captured url (live: `browser.cookies.getAll({ url })`; tests inject a fake). */
  readonly getAll: () => Promise<readonly CookieLike[]>;
}

/** Map the browser's `sameSite` status onto the schema enum (`no_restriction` → `none`). */
function toSameSite(sameSite: string | undefined): CookieSameSite {
  switch ((sameSite ?? '').toLowerCase()) {
    case 'no_restriction':
    case 'none':
      return 'none';
    case 'lax':
      return 'lax';
    case 'strict':
      return 'strict';
    default:
      return 'unspecified';
  }
}

/**
 * ISO expiry for a persistent cookie, or `null` for a session cookie / unusable timestamp.
 * `expirationDate` is in seconds; an out-of-range value yields an Invalid Date whose toISOString()
 * throws, so fall back to `null` rather than aborting the collection.
 */
function toExpiresAt(expirationDate: number | undefined): string | null {
  if (typeof expirationDate !== 'number' || !Number.isFinite(expirationDate)) {
    return null;
  }
  const date = new Date(expirationDate * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Map one browser cookie to a schema entry (value still raw — masking is applied to the whole list). */
function toEntry(item: CookieLike): CookieEntry {
  const expiresAt = toExpiresAt(item.expirationDate);
  const session = item.session === true || expiresAt === null;
  return {
    name: typeof item.name === 'string' ? item.name : '',
    value: typeof item.value === 'string' ? item.value : '',
    domain: typeof item.domain === 'string' ? item.domain : '',
    path: typeof item.path === 'string' ? item.path : '',
    expiresAt,
    httpOnly: item.httpOnly === true,
    secure: item.secure === true,
    sameSite: toSameSite(item.sameSite),
    session,
    masked: false,
  };
}

/**
 * Collect the captured origin's cookies into a {@link CookiesDump}, masking every value by default.
 * Returns an empty dump when no cookies match, and `null` only when `getAll` rejects (never throws).
 */
export async function collectCookies(deps: CollectCookiesDeps): Promise<CookiesDump | null> {
  try {
    const items = await deps.getAll();
    const entries = items
      .map(toEntry)
      .sort(
        (a, b) =>
          a.domain.localeCompare(b.domain) ||
          a.name.localeCompare(b.name) ||
          a.path.localeCompare(b.path),
      )
      .slice(0, COOKIES_MAX);
    return { schemaVersion: 'v1', entries: scrubCookies(entries).value };
  } catch {
    return null;
  }
}
