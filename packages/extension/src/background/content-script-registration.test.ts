import { beforeEach, describe, expect, it, vi } from 'vitest';

// The module transitively imports lib/browser; stub the polyfill so the import succeeds in node.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import {
  PASSIVE_BRIDGE_SCRIPT_FILE,
  PASSIVE_BRIDGE_SCRIPT_ID,
  PASSIVE_MAIN_SCRIPT_FILE,
  PASSIVE_MAIN_SCRIPT_ID,
  PASSIVE_SCRIPT_IDS,
  originsToMatchPatterns,
  syncPassiveContentScripts,
  type RegisteredScript,
  type ScriptingRegistrar,
} from './content-script-registration';

describe('script file constants', () => {
  it('point at built, injectable .js artifacts (not TS sources)', () => {
    // registerContentScripts loads files from the packaged extension; a .ts source is never
    // present in dist, so it would fail to register at runtime.
    expect(PASSIVE_MAIN_SCRIPT_FILE).toBe('injected/main-entry.js');
    expect(PASSIVE_BRIDGE_SCRIPT_FILE).toBe('content/passive-bridge.js');
    expect(PASSIVE_MAIN_SCRIPT_FILE).not.toMatch(/\.tsx?$/);
    expect(PASSIVE_BRIDGE_SCRIPT_FILE).not.toMatch(/\.tsx?$/);
  });

  it('exposes both script ids', () => {
    expect(PASSIVE_SCRIPT_IDS).toEqual([PASSIVE_MAIN_SCRIPT_ID, PASSIVE_BRIDGE_SCRIPT_ID]);
  });
});

describe('originsToMatchPatterns', () => {
  it('maps each origin to an all-paths match pattern', () => {
    expect(originsToMatchPatterns(['https://example.com'])).toEqual(['https://example.com/*']);
  });

  it('de-duplicates and sorts for a stable registration', () => {
    expect(originsToMatchPatterns(['https://b.com', 'https://a.com', 'https://b.com'])).toEqual([
      'https://a.com/*',
      'https://b.com/*',
    ]);
  });

  it('returns an empty array for no origins', () => {
    expect(originsToMatchPatterns([])).toEqual([]);
  });
});

/** Build a fake scripting registrar backed by an in-memory list, with call spies. */
function fakeScripting(initial: RegisteredScript[] = []) {
  let registered = [...initial];
  const register = vi.fn((scripts: RegisteredScript[]) => {
    registered = [...registered, ...scripts];
    return Promise.resolve();
  });
  const update = vi.fn((scripts: RegisteredScript[]) => {
    registered = registered.map((s) => scripts.find((n) => n.id === s.id) ?? s);
    return Promise.resolve();
  });
  const unregister = vi.fn((filter?: { ids?: string[] }) => {
    const ids = filter?.ids;
    registered = ids ? registered.filter((s) => !ids.includes(s.id)) : [];
    return Promise.resolve();
  });
  const get = vi.fn((filter?: { ids?: string[] }) => {
    const ids = filter?.ids;
    return Promise.resolve(ids ? registered.filter((s) => ids.includes(s.id)) : [...registered]);
  });
  const scripting: ScriptingRegistrar = {
    getRegisteredContentScripts: get,
    registerContentScripts: register,
    updateContentScripts: update,
    unregisterContentScripts: unregister,
  };
  return { scripting, register, update, unregister, get, current: () => registered };
}

describe('syncPassiveContentScripts', () => {
  let fake: ReturnType<typeof fakeScripting>;
  beforeEach(() => {
    fake = fakeScripting();
  });

  it('registers a MAIN-world and an ISOLATED bridge script at document_start for allowlisted origins', async () => {
    const result = await syncPassiveContentScripts({
      getOrigins: () => Promise.resolve(['https://example.com']),
      scripting: fake.scripting,
    });

    expect(result.ok).toBe(true);
    expect(result.active).toEqual([PASSIVE_MAIN_SCRIPT_ID, PASSIVE_BRIDGE_SCRIPT_ID]);
    expect(fake.update).not.toHaveBeenCalled();
    expect(fake.register).toHaveBeenCalledTimes(1);
    expect(fake.register).toHaveBeenCalledWith([
      expect.objectContaining({
        id: PASSIVE_MAIN_SCRIPT_ID,
        js: [PASSIVE_MAIN_SCRIPT_FILE],
        world: 'MAIN',
        runAt: 'document_start',
        persistAcrossSessions: true,
        matches: ['https://example.com/*'],
      }),
      expect.objectContaining({
        id: PASSIVE_BRIDGE_SCRIPT_ID,
        js: [PASSIVE_BRIDGE_SCRIPT_FILE],
        world: 'ISOLATED',
        runAt: 'document_start',
        persistAcrossSessions: true,
        matches: ['https://example.com/*'],
      }),
    ]);
  });

  it('updates (not re-registers) scripts that already exist, refreshing their match patterns', async () => {
    fake = fakeScripting([
      { id: PASSIVE_MAIN_SCRIPT_ID, matches: ['https://old.com/*'] },
      { id: PASSIVE_BRIDGE_SCRIPT_ID, matches: ['https://old.com/*'] },
    ]);

    const result = await syncPassiveContentScripts({
      getOrigins: () => Promise.resolve(['https://new.com']),
      scripting: fake.scripting,
    });

    expect(result.ok).toBe(true);
    expect(fake.register).not.toHaveBeenCalled();
    expect(fake.update).toHaveBeenCalledTimes(1);
    expect(fake.update).toHaveBeenCalledWith([
      expect.objectContaining({ id: PASSIVE_MAIN_SCRIPT_ID, matches: ['https://new.com/*'] }),
      expect.objectContaining({ id: PASSIVE_BRIDGE_SCRIPT_ID, matches: ['https://new.com/*'] }),
    ]);
  });

  it('registers the missing script and updates the present one when only one is already registered', async () => {
    fake = fakeScripting([{ id: PASSIVE_MAIN_SCRIPT_ID, matches: ['https://old.com/*'] }]);

    await syncPassiveContentScripts({
      getOrigins: () => Promise.resolve(['https://new.com']),
      scripting: fake.scripting,
    });

    expect(fake.register).toHaveBeenCalledTimes(1);
    expect(fake.register).toHaveBeenCalledWith([
      expect.objectContaining({ id: PASSIVE_BRIDGE_SCRIPT_ID }),
    ]);
    expect(fake.update).toHaveBeenCalledTimes(1);
    expect(fake.update).toHaveBeenCalledWith([
      expect.objectContaining({ id: PASSIVE_MAIN_SCRIPT_ID }),
    ]);
  });

  it('unregisters existing passive scripts when the allowlist is empty', async () => {
    fake = fakeScripting([
      { id: PASSIVE_MAIN_SCRIPT_ID, matches: ['https://old.com/*'] },
      { id: PASSIVE_BRIDGE_SCRIPT_ID, matches: ['https://old.com/*'] },
    ]);

    const result = await syncPassiveContentScripts({
      getOrigins: () => Promise.resolve([]),
      scripting: fake.scripting,
    });

    expect(result).toEqual({ ok: true, active: [] });
    expect(fake.unregister).toHaveBeenCalledTimes(1);
    expect(fake.unregister).toHaveBeenCalledWith({
      ids: [PASSIVE_MAIN_SCRIPT_ID, PASSIVE_BRIDGE_SCRIPT_ID],
    });
    expect(fake.register).not.toHaveBeenCalled();
    expect(fake.update).not.toHaveBeenCalled();
  });

  it('does nothing when the allowlist is empty and no passive scripts are registered', async () => {
    const result = await syncPassiveContentScripts({
      getOrigins: () => Promise.resolve([]),
      scripting: fake.scripting,
    });

    expect(result).toEqual({ ok: true, active: [] });
    expect(fake.unregister).not.toHaveBeenCalled();
    expect(fake.register).not.toHaveBeenCalled();
    expect(fake.update).not.toHaveBeenCalled();
  });

  it('reports ok:false with a reason when the scripting API throws, without throwing', async () => {
    const scripting: ScriptingRegistrar = {
      getRegisteredContentScripts: vi.fn(() => Promise.reject(new Error('no scripting'))),
      registerContentScripts: vi.fn(),
      updateContentScripts: vi.fn(),
      unregisterContentScripts: vi.fn(),
    };

    const result = await syncPassiveContentScripts({
      getOrigins: () => Promise.resolve(['https://example.com']),
      scripting,
    });

    expect(result.ok).toBe(false);
    expect(result.active).toEqual([]);
    expect(result.reason).toContain('no scripting');
  });
});
