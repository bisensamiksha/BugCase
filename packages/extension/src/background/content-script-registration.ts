import browser from '../lib/browser';
import { getAllowedOrigins } from '../storage/origin-allowlist';

/** Registration id for the page-world (MAIN) passive-monitoring script. */
export const PASSIVE_MAIN_SCRIPT_ID = 'bugcase-passive-main';
/** Registration id for the isolated-world bridge that relays page-world data to the worker. */
export const PASSIVE_BRIDGE_SCRIPT_ID = 'bugcase-passive-bridge';
/** Both ids, in registration order, so callers can filter/unregister exactly our scripts. */
export const PASSIVE_SCRIPT_IDS = [PASSIVE_MAIN_SCRIPT_ID, PASSIVE_BRIDGE_SCRIPT_ID] as const;

// Built IIFE artifacts (see vite.injected.config.ts). `registerContentScripts` loads files from
// the packaged extension and runs them as classic scripts, so these must be emitted JS at fixed
// paths, never the TS source.
/** Built MAIN-world entry injected at document_start. */
export const PASSIVE_MAIN_SCRIPT_FILE = 'injected/main-entry.js';
/** Built isolated-world bridge bootstrap injected at document_start. */
export const PASSIVE_BRIDGE_SCRIPT_FILE = 'content/passive-bridge.js';

/**
 * The slice of a `RegisteredContentScript` we set. Declared locally (rather than leaning on the
 * polyfill's types) so the registration shape is explicit and the API is trivially fakeable in tests.
 */
export interface RegisteredScript {
  id: string;
  matches?: string[];
  js?: string[];
  runAt?: 'document_start' | 'document_end' | 'document_idle';
  world?: 'ISOLATED' | 'MAIN';
  persistAcrossSessions?: boolean;
  allFrames?: boolean;
}

/** The `chrome.scripting` registration surface we depend on (promise-style via webextension-polyfill). */
export interface ScriptingRegistrar {
  getRegisteredContentScripts(filter?: { ids?: string[] }): Promise<RegisteredScript[]>;
  registerContentScripts(scripts: RegisteredScript[]): Promise<void>;
  updateContentScripts(scripts: RegisteredScript[]): Promise<void>;
  unregisterContentScripts(filter?: { ids?: string[] }): Promise<void>;
}

export interface SyncPassiveContentScriptsDeps {
  /** Defaults to the stored origin allowlist; injected in tests. */
  readonly getOrigins?: () => Promise<string[]>;
  /** Defaults to `browser.scripting`; injected in tests. */
  readonly scripting?: ScriptingRegistrar;
}

export interface SyncPassiveContentScriptsResult {
  readonly ok: boolean;
  /** Ids active after the sync — both script ids when origins are allowlisted, `[]` when cleared. */
  readonly active: string[];
  readonly reason?: string;
}

function scriptingApi(deps: SyncPassiveContentScriptsDeps): ScriptingRegistrar {
  return deps.scripting ?? browser.scripting;
}

function toReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Map allowlisted origins (e.g. `https://example.com`) to all-paths host match patterns
 * (`https://example.com/*`), de-duplicated and sorted so registration is deterministic.
 */
export function originsToMatchPatterns(origins: string[]): string[] {
  return [...new Set(origins.map((origin) => `${origin}/*`))].sort();
}

function buildPassiveScripts(matches: string[]): RegisteredScript[] {
  return [
    {
      id: PASSIVE_MAIN_SCRIPT_ID,
      js: [PASSIVE_MAIN_SCRIPT_FILE],
      matches,
      runAt: 'document_start',
      world: 'MAIN',
      persistAcrossSessions: true,
    },
    {
      id: PASSIVE_BRIDGE_SCRIPT_ID,
      js: [PASSIVE_BRIDGE_SCRIPT_FILE],
      matches,
      runAt: 'document_start',
      world: 'ISOLATED',
      persistAcrossSessions: true,
    },
  ];
}

/**
 * Reconcile the registered passive-monitoring content scripts with the current origin allowlist.
 *
 * Registrations created here persist across service-worker restarts (`persistAcrossSessions`), so
 * this is called on install/startup to repair drift and after every allowlist mutation. Scripts run
 * at `document_start` — the MAIN-world entry in the page world, the bridge in the isolated world —
 * but only on allowlisted origins. An empty allowlist tears our scripts down. Invalid state and
 * scripting failures are reported, never thrown, so a caller (e.g. the allowlist handler) is safe.
 */
export async function syncPassiveContentScripts(
  deps: SyncPassiveContentScriptsDeps = {},
): Promise<SyncPassiveContentScriptsResult> {
  const getOrigins = deps.getOrigins ?? getAllowedOrigins;
  const scripting = scriptingApi(deps);

  try {
    const matches = originsToMatchPatterns(await getOrigins());
    const existing = await scripting.getRegisteredContentScripts({ ids: [...PASSIVE_SCRIPT_IDS] });
    const existingIds = new Set(existing.map((script) => script.id));

    if (matches.length === 0) {
      if (existingIds.size > 0) {
        await scripting.unregisterContentScripts({ ids: [...existingIds] });
      }
      return { ok: true, active: [] };
    }

    const desired = buildPassiveScripts(matches);
    const toRegister = desired.filter((script) => !existingIds.has(script.id));
    const toUpdate = desired.filter((script) => existingIds.has(script.id));

    if (toRegister.length > 0) {
      await scripting.registerContentScripts(toRegister);
    }
    if (toUpdate.length > 0) {
      await scripting.updateContentScripts(toUpdate);
    }

    return { ok: true, active: desired.map((script) => script.id) };
  } catch (error) {
    return { ok: false, active: [], reason: toReason(error) };
  }
}
