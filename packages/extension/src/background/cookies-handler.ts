/**
 * Service-worker cookies adapter (S2-17).
 *
 * Bridges the pure {@link collectCookies} collector to the live browser: it gates on the optional
 * `cookies` permission (collecting only when already granted — never prompts mid-capture) and supplies
 * `browser.cookies.getAll({ url })` scoped to the captured page url. `runCaptureFlow` consumes the
 * returned function as `deps.collectCookies`, recording the result as `report.cookies`. Not a
 * runtime-message handler — cookies are gathered during the existing capture flow. Never throws;
 * degrades to `null`.
 *
 * Firefox parity: `browser.cookies.getAll({ url })` exists in Firefox with the `cookies` permission and
 * a matching host permission, so the gated collect path works identically; the schema's `sameSite` enum
 * maps cleanly from both browsers (`no_restriction` → `none`) inside {@link collectCookies}, so no
 * browser branching is needed. The permission gate plus never-throw degradation covers absence.
 */

import type { CookiesDump } from '@bugcase/schema';

import { collectCookies, type CookieLike } from '../capture/cookies';
import browser from '../lib/browser';
import { hasOptionalPermissions } from '../permissions/optional-permissions';

export interface CookiesCollectorDeps {
  /** Defaults to `hasOptionalPermissions({ permissions: ['cookies'] })`. */
  readonly isGranted?: () => Promise<boolean>;
  /** Defaults to `browser.cookies.getAll({ url })`. */
  readonly getAll?: (url: string) => Promise<readonly CookieLike[]>;
}

/**
 * Build the cookies collector for the capture flow. The returned function resolves `null` when the
 * `cookies` permission is not granted (and never calls the API), when no url is available, or on any
 * unexpected error; otherwise it delegates to {@link collectCookies} scoped to `url`.
 */
export function createCookiesCollector(
  deps: CookiesCollectorDeps = {},
): (url: string) => Promise<CookiesDump | null> {
  const isGranted = deps.isGranted ?? (() => hasOptionalPermissions({ permissions: ['cookies'] }));
  const getAll = deps.getAll ?? ((url: string) => browser.cookies.getAll({ url }));

  return async (url: string) => {
    try {
      if (url.length === 0 || !(await isGranted())) {
        return null;
      }
      return await collectCookies({ getAll: () => getAll(url) });
    } catch {
      return null;
    }
  };
}
