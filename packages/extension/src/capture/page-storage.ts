/**
 * Local/session storage collector (S2-18).
 *
 * Maps the in-page read (`../injected/storage-reader`) into the report's {@link StorageDump}. Per
 * the project's scrub-by-default posture, a value is masked outright when its key looks sensitive
 * (token/auth/secret/…), otherwise the S2-09 {@link maskSecretsInString} masks any Bearer/JWT token
 * inside it — benign app state survives. Entries are sorted by key for deterministic output and
 * capped at {@link STORAGE_MAX_ENTRIES}. Pure and dependency-injected (the executeScript read is
 * supplied by `background/service-worker`), so it is unit-testable without the browser. Mirrors the
 * S2-13 DOM-snapshot / S2-17 cookies collectors; never throws — any failure resolves to `null`.
 */

import {
  SCRUBBED_VALUE_PLACEHOLDER,
  maskSecretsInString,
  type StorageDump,
  type StorageEntry,
} from '@bugcase/schema';

import type { RawPageStorage, RawStorageEntry } from '../injected/storage-reader';

/** Defensive per-area entry cap (real pages have a handful of keys; this bounds pathology). */
export const STORAGE_MAX_ENTRIES = 500;

/** Case-insensitive: a key containing any of these is treated as holding a secret value. */
const SENSITIVE_KEY_PATTERN =
  /token|auth|secret|password|passwd|pwd|key|jwt|session|credential|apikey/i;

const STORAGE_NOTE =
  'localStorage/sessionStorage captured at capture time. Values are masked when the key looks ' +
  'sensitive (token/auth/secret/password/key/jwt/session/credential) or a Bearer/JWT token is ' +
  'detected; values over 8192 chars are truncated (sizeBytes is the original size).';

export interface CollectPageStorageDeps {
  /** Reads both storage areas in the page (e.g. via `executeScript`). */
  readonly readStorage: () => Promise<RawPageStorage>;
}

/** Mask the value: full redaction for a sensitive key, else mask embedded Bearer/JWT tokens. */
function maskValue(key: string, value: string): string {
  if (value.length === 0) {
    return value;
  }
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return SCRUBBED_VALUE_PLACEHOLDER;
  }
  return maskSecretsInString(value).value;
}

/** Sort by key, cap, and mask one area's raw entries into schema {@link StorageEntry} records. */
function toEntries(raw: readonly RawStorageEntry[]): readonly StorageEntry[] {
  return [...raw]
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(0, STORAGE_MAX_ENTRIES)
    .map((entry) => ({
      key: entry.key,
      value: maskValue(entry.key, entry.value),
      sizeBytes: entry.sizeBytes,
    }));
}

/**
 * Collect masked, bounded local/session storage into a {@link StorageDump}. A `null` area is
 * preserved as `null` (that area could not be read); a successful-but-empty area becomes `[]`.
 * Returns `null` only when the read itself rejects (never throws).
 */
export async function collectPageStorage(
  deps: CollectPageStorageDeps,
): Promise<StorageDump | null> {
  try {
    const raw = await deps.readStorage();
    return {
      schemaVersion: 'v1',
      localStorage: raw.localStorage ? toEntries(raw.localStorage) : null,
      sessionStorage: raw.sessionStorage ? toEntries(raw.sessionStorage) : null,
      note: STORAGE_NOTE,
    };
  } catch {
    return null;
  }
}
