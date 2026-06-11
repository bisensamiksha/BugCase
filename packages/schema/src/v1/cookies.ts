export type CookieSameSite = 'strict' | 'lax' | 'none' | 'unspecified';

export interface CookieEntry {
  readonly name: string;
  readonly value: string;
  readonly domain: string;
  readonly path: string;
  readonly expiresAt: string | null;
  readonly httpOnly: boolean;
  readonly secure: boolean;
  readonly sameSite: CookieSameSite;
  readonly session: boolean;
  readonly masked: boolean;
}

export interface CookiesDump {
  readonly schemaVersion: 'v1';
  readonly entries: readonly CookieEntry[];
}
