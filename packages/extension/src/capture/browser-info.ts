/**
 * Browser info collector (S2-14).
 *
 * Gathers `BrowserInfo` for the report: User-Agent string, UA Client Hints high-entropy values
 * (`navigator.userAgentData.getHighEntropyValues`, Chromium only — Firefox/Safari fall back to the
 * UA string with `userAgentData: null`), preferred languages, and the IANA timezone. Reads ambient
 * globals through an injectable {@link BrowserInfoSource} so it's unit-testable, mirroring the S1-11
 * metadata collector. `installedExtensions` is left `null` here — it's collected in S2-16.
 */

import type { BrowserInfo, UserAgentBrand, UserAgentData } from '@bugcase/schema';

/** Shape returned by `navigator.userAgentData.getHighEntropyValues` (fields are best-effort). */
export interface UserAgentHighEntropy {
  readonly brands?: readonly UserAgentBrand[];
  readonly fullVersionList?: readonly UserAgentBrand[];
  readonly mobile?: boolean;
  readonly platform?: string;
  readonly platformVersion?: string;
  readonly architecture?: string;
  readonly bitness?: string;
}

/** Ambient browser globals the collector needs. Injectable for tests. */
export interface BrowserInfoSource {
  readonly userAgent: string;
  readonly languages: readonly string[];
  readonly timezone: string;
  /** UA-CH reader (Chromium only); `undefined` where `navigator.userAgentData` is absent. */
  readonly getHighEntropyValues?: ((hints: string[]) => Promise<UserAgentHighEntropy>) | undefined;
}

export interface CollectBrowserInfoOptions {
  readonly source?: BrowserInfoSource;
}

const HIGH_ENTROPY_HINTS = [
  'platform',
  'platformVersion',
  'architecture',
  'bitness',
  'model',
  'fullVersionList',
] as const;

interface UserAgentDataLike {
  readonly getHighEntropyValues?: (hints: string[]) => Promise<UserAgentHighEntropy>;
}

function readTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

/** Read the ambient navigator/Intl globals. Safe anywhere — missing globals yield empty values. */
export function readBrowserInfoSource(): BrowserInfoSource {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const uaData = (nav as (Navigator & { userAgentData?: UserAgentDataLike }) | undefined)
    ?.userAgentData;
  const languages = nav?.languages ?? (nav?.language ? [nav.language] : []);

  return {
    userAgent: nav?.userAgent ?? '',
    languages,
    timezone: readTimezone(),
    getHighEntropyValues: uaData?.getHighEntropyValues
      ? uaData.getHighEntropyValues.bind(uaData)
      : undefined,
  };
}

function normalizeBrands(brands: readonly UserAgentBrand[] | undefined): UserAgentBrand[] {
  return (brands ?? [])
    .filter((b) => typeof b?.brand === 'string' && typeof b?.version === 'string')
    .map((b) => ({ brand: b.brand, version: b.version }));
}

/**
 * Collect {@link BrowserInfo}. Never throws: if UA-CH lookup fails or is unavailable, `userAgentData`
 * is `null` and the UA string still populates the report.
 */
export async function collectBrowserInfo(
  options: CollectBrowserInfoOptions = {},
): Promise<BrowserInfo> {
  const source = options.source ?? readBrowserInfoSource();

  let userAgentData: UserAgentData | null = null;
  if (source.getHighEntropyValues) {
    try {
      const hev = await source.getHighEntropyValues([...HIGH_ENTROPY_HINTS]);
      userAgentData = {
        brands: normalizeBrands(hev.fullVersionList ?? hev.brands),
        platform: hev.platform ?? null,
        platformVersion: hev.platformVersion ?? null,
        mobile: hev.mobile ?? false,
        architecture: hev.architecture ?? null,
        bitness: hev.bitness ?? null,
      };
    } catch {
      userAgentData = null;
    }
  }

  return {
    schemaVersion: 'v1',
    userAgent: source.userAgent,
    userAgentData,
    languages: [...source.languages],
    timezone: source.timezone,
    installedExtensions: null,
  };
}
