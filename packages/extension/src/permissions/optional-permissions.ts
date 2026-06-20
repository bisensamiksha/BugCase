import browser from '../lib/browser';

/**
 * Optional API permissions the extension may request at runtime (mirrors the manifest).
 * Note: `debugger` is intentionally NOT here — Chrome forbids it in optional_permissions, so it
 * is a required install-time permission and cannot be requested via `chrome.permissions.request`.
 */
export type OptionalPermissionName = 'cookies' | 'management' | 'history';

/** A permission set to request, check, or remove. Either field may be omitted. */
export interface OptionalPermissionRequest {
  readonly permissions?: readonly OptionalPermissionName[];
  /** Optional host permissions, e.g. `https://example.com/*` or `<all_urls>`. */
  readonly origins?: readonly string[];
}

/** The slice of `chrome.permissions` we depend on (promise-style via webextension-polyfill). */
export interface PermissionsApi {
  request(request: { permissions?: string[]; origins?: string[] }): Promise<boolean>;
  contains(request: { permissions?: string[]; origins?: string[] }): Promise<boolean>;
  remove(request: { permissions?: string[]; origins?: string[] }): Promise<boolean>;
}

export interface OptionalPermissionDeps {
  /** Defaults to `browser.permissions`; injected in tests. */
  readonly permissions?: PermissionsApi;
}

/** Convert a request to the mutable `{ permissions, origins }` arg, dropping empty fields. */
function toArg(request: OptionalPermissionRequest): { permissions?: string[]; origins?: string[] } {
  return {
    ...(request.permissions && request.permissions.length > 0
      ? { permissions: [...request.permissions] }
      : {}),
    ...(request.origins && request.origins.length > 0 ? { origins: [...request.origins] } : {}),
  };
}

function isEmpty(arg: { permissions?: string[]; origins?: string[] }): boolean {
  return arg.permissions === undefined && arg.origins === undefined;
}

function api(deps: OptionalPermissionDeps): PermissionsApi {
  return deps.permissions ?? browser.permissions;
}

/**
 * Request an optional permission set via `chrome.permissions.request`. Must originate from a
 * user gesture in a context that exposes the permissions API (popup/options, or the service
 * worker bridge). Resolves `true` on grant, `false` on denial, empty input, or any rejection
 * (e.g. "must be called during a user gesture") — never throws.
 */
export async function requestOptionalPermissions(
  request: OptionalPermissionRequest,
  deps: OptionalPermissionDeps = {},
): Promise<boolean> {
  const arg = toArg(request);
  if (isEmpty(arg)) {
    return false;
  }
  try {
    return await api(deps).request(arg);
  } catch {
    return false;
  }
}

/** Whether the permission set is already granted. Resolves `false` on empty input or rejection. */
export async function hasOptionalPermissions(
  request: OptionalPermissionRequest,
  deps: OptionalPermissionDeps = {},
): Promise<boolean> {
  const arg = toArg(request);
  if (isEmpty(arg)) {
    return false;
  }
  try {
    return await api(deps).contains(arg);
  } catch {
    return false;
  }
}

/** Remove a previously granted optional permission set. Resolves `false` on empty input or rejection. */
export async function removeOptionalPermissions(
  request: OptionalPermissionRequest,
  deps: OptionalPermissionDeps = {},
): Promise<boolean> {
  const arg = toArg(request);
  if (isEmpty(arg)) {
    return false;
  }
  try {
    return await api(deps).remove(arg);
  } catch {
    return false;
  }
}
