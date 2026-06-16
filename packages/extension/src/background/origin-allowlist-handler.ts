import {
  addAllowedOrigin,
  getAllowedOrigins,
  isOriginAllowed,
  removeAllowedOrigin,
} from '../storage/origin-allowlist';

/** Runtime message: overlay/popup → service worker, reading or mutating the origin allowlist. */
export const ORIGIN_ALLOWLIST_MESSAGE = 'bugcase/origin-allowlist';

export type OriginAllowlistAction = 'get' | 'isAllowed' | 'add' | 'remove';

export interface OriginAllowlistRequest {
  readonly type: typeof ORIGIN_ALLOWLIST_MESSAGE;
  readonly action: OriginAllowlistAction;
  /** Required for `isAllowed`, `add`, and `remove`; ignored for `get`. */
  readonly origin?: string;
}

/** Serializable allowlist result. `ok` is false on an invalid request or an unexpected throw. */
export interface OriginAllowlistResponse {
  readonly ok: boolean;
  readonly origins: string[];
  /** Present only for the `isAllowed` action. */
  readonly allowed?: boolean;
  readonly reason?: string;
}

export interface OriginAllowlistHandlerDeps {
  readonly getAllowed?: () => Promise<string[]>;
  readonly isAllowed?: (origin: string) => Promise<boolean>;
  readonly add?: (origin: string) => Promise<string[]>;
  readonly remove?: (origin: string) => Promise<string[]>;
}

export function isOriginAllowlistRequest(value: unknown): value is OriginAllowlistRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === ORIGIN_ALLOWLIST_MESSAGE
  );
}

/**
 * Service-worker bridge for the per-origin allowlist. The overlay runs as a content script;
 * routing allowlist reads/writes through the worker keeps a single owner of the stored state.
 * Resolves a serializable result; invalid input and errors are reported, never thrown.
 */
export async function handleOriginAllowlist(
  message: OriginAllowlistRequest,
  deps: OriginAllowlistHandlerDeps = {},
): Promise<OriginAllowlistResponse> {
  const getAllowed = deps.getAllowed ?? getAllowedOrigins;
  const isAllowed = deps.isAllowed ?? isOriginAllowed;
  const add = deps.add ?? addAllowedOrigin;
  const remove = deps.remove ?? removeAllowedOrigin;

  try {
    switch (message.action) {
      case 'get':
        return { ok: true, origins: await getAllowed() };
      case 'isAllowed': {
        if (!message.origin) {
          return { ok: false, origins: [], reason: 'origin is required' };
        }
        return { ok: true, origins: [], allowed: await isAllowed(message.origin) };
      }
      case 'add': {
        if (!message.origin) {
          return { ok: false, origins: [], reason: 'origin is required' };
        }
        return { ok: true, origins: await add(message.origin) };
      }
      case 'remove': {
        if (!message.origin) {
          return { ok: false, origins: [], reason: 'origin is required' };
        }
        return { ok: true, origins: await remove(message.origin) };
      }
      default:
        return { ok: false, origins: [], reason: `unknown action: ${String(message.action)}` };
    }
  } catch (error) {
    return {
      ok: false,
      origins: [],
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
