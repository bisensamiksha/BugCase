/**
 * Service-worker navigation-history adapter (S2-15).
 *
 * Bridges the pure {@link collectNavigationHistory} collector to the live browser: it gates on the
 * optional `history` permission (collecting only when already granted — never prompts mid-capture)
 * and supplies `browser.history.search`. `runCaptureFlow` consumes the returned function as
 * `deps.collectNavigation`. Not a runtime-message handler — history is gathered during the existing
 * capture flow, not on an overlay request. Never throws; degrades to `null`.
 */

import type { NavigationLog } from '@bugcase/schema';

import {
  collectNavigationHistory,
  type HistoryItemLike,
  type HistorySearchQuery,
} from '../capture/navigation-history';
import browser from '../lib/browser';
import { hasOptionalPermissions } from '../permissions/optional-permissions';

export interface NavigationHistoryCollectorDeps {
  /** Defaults to `hasOptionalPermissions({ permissions: ['history'] })`. */
  readonly isGranted?: () => Promise<boolean>;
  /** Defaults to `browser.history.search`. */
  readonly search?: (query: HistorySearchQuery) => Promise<readonly HistoryItemLike[]>;
}

/**
 * Build the navigation-history collector for the capture flow. The returned function resolves
 * `null` when `history` is not granted (and never calls the API), otherwise delegates to
 * {@link collectNavigationHistory}. Any unexpected error resolves `null`.
 */
export function createNavigationHistoryCollector(
  deps: NavigationHistoryCollectorDeps = {},
): () => Promise<NavigationLog | null> {
  const isGranted = deps.isGranted ?? (() => hasOptionalPermissions({ permissions: ['history'] }));
  const search = deps.search ?? ((query: HistorySearchQuery) => browser.history.search(query));

  return async () => {
    try {
      if (!(await isGranted())) {
        return null;
      }
      return await collectNavigationHistory({ search });
    } catch {
      return null;
    }
  };
}
