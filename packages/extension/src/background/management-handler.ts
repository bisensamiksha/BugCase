/**
 * Service-worker installed-extensions adapter (S2-16).
 *
 * Bridges the pure {@link collectInstalledExtensions} collector to the live browser: it gates on the
 * optional `management` permission (collecting only when already granted — never prompts mid-capture),
 * supplies `browser.management.getAll`, and excludes the BugCase extension via `browser.runtime.id`.
 * `runCaptureFlow` consumes the returned function as `deps.collectExtensions`, folding the result into
 * `report.browser.installedExtensions`. Never throws; degrades to `null`.
 *
 * Firefox parity: `browser.management.getAll()` and `browser.runtime.id` both exist in Firefox with
 * the `management` permission, so the full collect + self-exclusion path works identically. The only
 * difference is the `type` values Firefox reports (`'extension' | 'theme'`; no app types like Chrome's
 * `hosted_app` / `packaged_app` / `legacy_packaged_app` / `login_screen_extension`); because the
 * schema's `type` is a free string, both map cleanly with no browser branching. No Firefox-specific
 * fallback is needed — the permission gate plus never-throw degradation covers absence.
 */

import type { InstalledExtensionInfo } from '@bugcase/schema';

import {
  collectInstalledExtensions,
  type ManagementExtensionInfoLike,
} from '../capture/installed-extensions';
import browser from '../lib/browser';
import { hasOptionalPermissions } from '../permissions/optional-permissions';

export interface InstalledExtensionsCollectorDeps {
  /** Defaults to `hasOptionalPermissions({ permissions: ['management'] })`. */
  readonly isGranted?: () => Promise<boolean>;
  /** Defaults to `browser.management.getAll`. */
  readonly getAll?: () => Promise<readonly ManagementExtensionInfoLike[]>;
  /** Defaults to `browser.runtime?.id` (read lazily inside the returned closure). */
  readonly selfId?: string;
}

/**
 * Build the installed-extensions collector for the capture flow. The returned function resolves
 * `null` when `management` is not granted (and never calls the API), otherwise delegates to
 * {@link collectInstalledExtensions}. Any unexpected error resolves `null`.
 */
export function createInstalledExtensionsCollector(
  deps: InstalledExtensionsCollectorDeps = {},
): () => Promise<readonly InstalledExtensionInfo[] | null> {
  const isGranted =
    deps.isGranted ?? (() => hasOptionalPermissions({ permissions: ['management'] }));
  const getAll = deps.getAll ?? (() => browser.management.getAll());

  return async () => {
    try {
      if (!(await isGranted())) {
        return null;
      }
      const selfId = deps.selfId ?? browser.runtime?.id;
      return await collectInstalledExtensions({ getAll, selfId });
    } catch {
      return null;
    }
  };
}
