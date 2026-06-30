import {
  hasOptionalPermissions,
  requestOptionalPermissions,
  type OptionalPermissionName,
  type OptionalPermissionRequest,
} from '../permissions/optional-permissions';

/** Runtime message: overlay/popup → service worker, asking it to request an optional permission set. */
export const REQUEST_PERMISSIONS = 'bugcase/request-permissions';

export interface RequestPermissionsRequest {
  readonly type: typeof REQUEST_PERMISSIONS;
  readonly permissions?: readonly OptionalPermissionName[];
  readonly origins?: readonly string[];
}

/** Serializable result of a permission request. `ok` is false only on an unexpected throw. */
export interface RequestPermissionsResponse {
  readonly ok: boolean;
  readonly granted: boolean;
  readonly reason?: string;
}

export interface PermissionsHandlerDeps {
  /** Defaults to {@link requestOptionalPermissions}; injected in tests. */
  readonly request?: (request: OptionalPermissionRequest) => Promise<boolean>;
}

export function isRequestPermissionsRequest(value: unknown): value is RequestPermissionsRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === REQUEST_PERMISSIONS
  );
}

/**
 * Runtime message: overlay → service worker, asking whether an optional permission set is already
 * granted. Unlike a request, `permissions.contains` needs no user gesture, so this bridge is safe
 * from the content-script overlay (where the gesture-bound `permissions.request` cannot be used).
 */
export const CONTAINS_PERMISSIONS = 'bugcase/contains-permissions';

export interface ContainsPermissionsRequest {
  readonly type: typeof CONTAINS_PERMISSIONS;
  readonly permissions?: readonly OptionalPermissionName[];
  readonly origins?: readonly string[];
}

export interface ContainsPermissionsHandlerDeps {
  /** Defaults to {@link hasOptionalPermissions}; injected in tests. */
  readonly has?: (request: OptionalPermissionRequest) => Promise<boolean>;
}

export function isContainsPermissionsRequest(value: unknown): value is ContainsPermissionsRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === CONTAINS_PERMISSIONS
  );
}

/** Gesture-free check of whether an optional permission set is already granted. Never throws. */
export async function handleContainsPermissions(
  message: ContainsPermissionsRequest,
  deps: ContainsPermissionsHandlerDeps = {},
): Promise<RequestPermissionsResponse> {
  const has = deps.has ?? hasOptionalPermissions;
  const permissionRequest: OptionalPermissionRequest = {
    ...(message.permissions ? { permissions: message.permissions } : {}),
    ...(message.origins ? { origins: message.origins } : {}),
  };
  try {
    const granted = await has(permissionRequest);
    return { ok: true, granted };
  } catch (error) {
    return {
      ok: false,
      granted: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Service-worker bridge for `chrome.permissions.request`. The overlay runs as a content script
 * and cannot reach the permissions API, so it sends a {@link RequestPermissionsRequest} the worker
 * fulfils here. Resolves a serializable result; deny/grant/error are reported, never thrown.
 */
export async function handleRequestPermissions(
  message: RequestPermissionsRequest,
  deps: PermissionsHandlerDeps = {},
): Promise<RequestPermissionsResponse> {
  const request = deps.request ?? requestOptionalPermissions;
  const permissionRequest: OptionalPermissionRequest = {
    ...(message.permissions ? { permissions: message.permissions } : {}),
    ...(message.origins ? { origins: message.origins } : {}),
  };
  try {
    const granted = await request(permissionRequest);
    return { ok: true, granted };
  } catch (error) {
    return {
      ok: false,
      granted: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
