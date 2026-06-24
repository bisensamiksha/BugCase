/**
 * Installed-extensions collector (S2-16).
 *
 * Maps `chrome.management.getAll` results into the report's {@link InstalledExtensionInfo} list.
 * Pure and dependency-injected (the real `management.getAll` is supplied by
 * `background/management-handler.ts`) so it is unit-testable without the browser, mirroring the
 * S2-15 navigation collector. Captures every item management returns (extensions, themes, apps;
 * enabled and disabled), recording each item's `type`, and excludes the BugCase extension itself
 * via `selfId`. No secret masking is needed — ids/names/versions are not free-text token carriers.
 * Never throws: a rejected `getAll` resolves to `null`.
 */

import type { InstalledExtensionInfo } from '@bugcase/schema';

/** Defensive upper bound on entries recorded (installed counts are small; this just caps pathology). */
export const INSTALLED_EXTENSIONS_MAX = 500;

/** Subset of `chrome.management.ExtensionInfo` the collector reads (all fields best-effort). */
export interface ManagementExtensionInfoLike {
  readonly id?: string;
  readonly name?: string;
  readonly version?: string;
  readonly enabled?: boolean;
  readonly type?: string;
}

export interface CollectInstalledExtensionsDeps {
  /** Lists installed items (live: `browser.management.getAll`; tests inject a fake). */
  readonly getAll: () => Promise<readonly ManagementExtensionInfoLike[]>;
  /** Own extension id to exclude (`browser.runtime.id`); omit to include self. */
  readonly selfId?: string;
}

/** Map one management item to a schema entry, or `null` if it lacks a usable id. */
function toInfo(item: ManagementExtensionInfoLike): InstalledExtensionInfo | null {
  if (typeof item.id !== 'string' || item.id.length === 0) {
    return null;
  }
  return {
    id: item.id,
    name: typeof item.name === 'string' ? item.name : '',
    version: typeof item.version === 'string' ? item.version : '',
    enabled: item.enabled === true,
    type: typeof item.type === 'string' ? item.type : '',
  };
}

/**
 * Collect installed extensions into an {@link InstalledExtensionInfo} list. Returns an empty array
 * when nothing is installed (or only self), and `null` only when `getAll` rejects (never throws).
 */
export async function collectInstalledExtensions(
  deps: CollectInstalledExtensionsDeps,
): Promise<readonly InstalledExtensionInfo[] | null> {
  try {
    const items = await deps.getAll();
    return items
      .filter((item) => item.id !== deps.selfId)
      .map(toInfo)
      .filter((info): info is InstalledExtensionInfo => info !== null)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
      .slice(0, INSTALLED_EXTENSIONS_MAX);
  } catch {
    return null;
  }
}
