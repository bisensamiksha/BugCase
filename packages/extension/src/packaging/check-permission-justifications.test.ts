import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildManifest } from '../manifest';

// S4-23: the store listing's per-permission justifications must match the built Chrome manifest
// permission-for-permission (an Acceptance Criterion). This gate parses the built manifest and
// `store/chrome/permission-justifications.md` and asserts a 1:1 mapping (no un-justified permission,
// no orphan justification). Like the other build-gate scripts (package-chrome, check-overlay-no-konva)
// it is a plain-node CLI exercised through the real process, so the untyped .mjs stays out of the
// src/** tsc graph. --json makes the result machine-readable.
const script = fileURLToPath(
  new URL('../../../../scripts/check-permission-justifications.mjs', import.meta.url),
);
// The committed, real Chrome justifications doc — the positive case proves it stays in sync.
const realDoc = fileURLToPath(
  new URL('../../../../store/chrome/permission-justifications.md', import.meta.url),
);

interface CheckResult {
  ok: boolean;
  manifestPermissions: string[];
  justifiedPermissions: string[];
  missing: string[];
  orphan: string[];
}

function writeTemp(name: string, contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'bugcase-perm-'));
  const filePath = join(dir, name);
  writeFileSync(filePath, contents);
  return filePath;
}

/** Minimal machine-parseable justifications doc: one table, one backticked permission id per row. */
function docJustifying(ids: string[]): string {
  const rows = ids.map((id) => `| \`${id}\` | Required | reason |`).join('\n');
  return `# Permission justifications\n\n| Permission | Class | Justification |\n|---|---|---|\n${rows}\n`;
}

function manifestJson(perms: {
  permissions?: string[];
  optional_permissions?: string[];
  optional_host_permissions?: string[];
}): string {
  return JSON.stringify({ manifest_version: 3, ...perms });
}

function run(
  manifestPath: string,
  justificationsPath: string,
): { code: number | null; result: CheckResult } {
  const res = spawnSync('node', [script, manifestPath, justificationsPath, '--json'], {
    encoding: 'utf8',
  });
  return { code: res.status, result: JSON.parse(res.stdout) as CheckResult };
}

// Cast to the concrete permission shape (like src/icons.test.ts casts to `{ icons: ... }`) — the
// broad `Record<string, unknown>` does not overlap the ManifestV3Export union's function arm.
const chromeManifest = buildManifest('chrome') as {
  permissions: string[];
  optional_permissions: string[];
  optional_host_permissions: string[];
};

describe('permission-justification no-drift gate', () => {
  it('every built Chrome manifest permission is justified in the real doc, with no orphans', () => {
    // The permission set here is the exact one that lands in the built manifest (crxjs adds/removes
    // none), so the positive case needs no dist-chrome build.
    const manifestPath = writeTemp('manifest.json', JSON.stringify(chromeManifest));
    const { code, result } = run(manifestPath, realDoc);
    expect(result.missing).toEqual([]);
    expect(result.orphan).toEqual([]);
    expect(result.ok).toBe(true);
    expect(code).toBe(0);
    // sanity: the required + optional + optional-host permissions are all present in the parse
    expect(result.manifestPermissions).toEqual(
      expect.arrayContaining([
        'activeTab',
        'storage',
        'scripting',
        'downloads',
        'tabs',
        'debugger',
        'cookies',
        'management',
        'history',
        '<all_urls>',
      ]),
    );
  });

  it('collects install-time, optional, and optional-host permissions', () => {
    const manifestPath = writeTemp(
      'manifest.json',
      manifestJson({
        permissions: ['activeTab'],
        optional_permissions: ['cookies'],
        optional_host_permissions: ['<all_urls>'],
      }),
    );
    const doc = writeTemp('doc.md', docJustifying(['activeTab', 'cookies', '<all_urls>']));
    const { code, result } = run(manifestPath, doc);
    expect(result.manifestPermissions).toEqual(['<all_urls>', 'activeTab', 'cookies']);
    expect(result.ok).toBe(true);
    expect(code).toBe(0);
  });

  it('flags a manifest permission with no justification (missing → exit 1)', () => {
    const manifestPath = writeTemp(
      'manifest.json',
      manifestJson({ permissions: ['activeTab', 'storage'] }),
    );
    const doc = writeTemp('doc.md', docJustifying(['activeTab']));
    const { code, result } = run(manifestPath, doc);
    expect(result.missing).toEqual(['storage']);
    expect(result.orphan).toEqual([]);
    expect(result.ok).toBe(false);
    expect(code).toBe(1);
  });

  it('flags a justification for a permission the manifest never requests (orphan → exit 1)', () => {
    const manifestPath = writeTemp('manifest.json', manifestJson({ permissions: ['activeTab'] }));
    const doc = writeTemp('doc.md', docJustifying(['activeTab', 'bogusPermission']));
    const { code, result } = run(manifestPath, doc);
    expect(result.orphan).toEqual(['bogusPermission']);
    expect(result.missing).toEqual([]);
    expect(result.ok).toBe(false);
    expect(code).toBe(1);
  });

  it('counts only table-cell justifications, not backticks in prose', () => {
    // A paragraph mentioning `storage` must not count as justifying it — only the first table cell does.
    const manifestPath = writeTemp(
      'manifest.json',
      manifestJson({ permissions: ['activeTab', 'storage'] }),
    );
    const doc = writeTemp(
      'doc.md',
      `We also use \`storage\` extensively.\n\n${docJustifying(['activeTab'])}`,
    );
    const { result } = run(manifestPath, doc);
    expect(result.missing).toEqual(['storage']);
  });
});
