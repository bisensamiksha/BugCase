import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// S4-23: no-drift gate between the built Chrome manifest and the store listing's per-permission
// justifications. The Acceptance Criterion requires the justifications to match the manifest
// permission-for-permission; this asserts a 1:1 mapping (every requested permission is justified,
// and no justification exists for a permission we don't request).
//
// Like the other build-gate CLIs (scripts/package-chrome.mjs, scripts/check-overlay-no-konva.mjs)
// this is a plain-node script with pure, testable helpers and a guarded `--json` CLI. Run it after
// `build:chrome`: `node scripts/check-permission-justifications.mjs`.

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_MANIFEST = path.join(REPO_ROOT, 'packages/extension/dist-chrome/manifest.json');
const DEFAULT_JUSTIFICATIONS = path.join(REPO_ROOT, 'store/chrome/permission-justifications.md');

/** Every manifest key that declares a permission requiring a store justification. */
const PERMISSION_KEYS = [
  'permissions',
  'optional_permissions',
  'host_permissions',
  'optional_host_permissions',
];

/**
 * Collect the sorted, de-duplicated union of every permission the manifest declares (install-time,
 * optional, and host — install-time or optional). Pure.
 *
 * @param {unknown} manifest Parsed `manifest.json`.
 * @returns {string[]}
 */
export function collectManifestPermissions(manifest) {
  const m = manifest && typeof manifest === 'object' ? manifest : {};
  const out = new Set();
  for (const key of PERMISSION_KEYS) {
    const value = m[key];
    if (!Array.isArray(value)) continue;
    for (const perm of value) {
      if (typeof perm === 'string' && perm.length > 0) out.add(perm);
    }
  }
  return [...out].sort();
}

/**
 * Parse the permission ids a justifications doc documents. The doc holds one markdown table whose
 * first column is the permission id in backticks (e.g. `` `activeTab` ``, `` `<all_urls>` ``); only
 * the first cell of a table row counts, so backticks in prose or in later columns are ignored. Pure.
 *
 * @param {string} markdown The justifications markdown.
 * @returns {string[]}
 */
export function parseJustifiedPermissions(markdown) {
  const ids = new Set();
  for (const line of String(markdown).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    // cells[0] is the empty string before the leading pipe; cells[1] is the first real cell.
    const firstCell = (trimmed.split('|')[1] ?? '').trim();
    const match = firstCell.match(/^`([^`]+)`$/);
    if (match) ids.add(match[1]);
  }
  return [...ids].sort();
}

/**
 * Diff the manifest permissions against the justified permissions. Pure.
 *
 * @param {string[]} manifestPermissions
 * @param {string[]} justifiedPermissions
 * @returns {{ missing: string[], orphan: string[] }} `missing` = requested but not justified;
 *   `orphan` = justified but not requested.
 */
export function diffPermissions(manifestPermissions, justifiedPermissions) {
  const justified = new Set(justifiedPermissions);
  const requested = new Set(manifestPermissions);
  const missing = manifestPermissions.filter((p) => !justified.has(p)).sort();
  const orphan = justifiedPermissions.filter((p) => !requested.has(p)).sort();
  return { missing, orphan };
}

export async function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const positional = argv.filter((a) => a !== '--json');
  const manifestPath = positional[0] ? path.resolve(positional[0]) : DEFAULT_MANIFEST;
  const justificationsPath = positional[1] ? path.resolve(positional[1]) : DEFAULT_JUSTIFICATIONS;

  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const markdown = await readFile(justificationsPath, 'utf8');
    const manifestPermissions = collectManifestPermissions(manifest);
    const justifiedPermissions = parseJustifiedPermissions(markdown);
    const { missing, orphan } = diffPermissions(manifestPermissions, justifiedPermissions);
    const ok = missing.length === 0 && orphan.length === 0;
    const result = { ok, manifestPermissions, justifiedPermissions, missing, orphan };

    if (json) {
      process.stdout.write(JSON.stringify(result));
    } else if (ok) {
      console.log(
        `check-permission-justifications: OK — ${manifestPermissions.length} permission(s) match ` +
          `their justifications (${path.relative(REPO_ROOT, justificationsPath)})`,
      );
    } else {
      if (missing.length) {
        console.error(
          `check-permission-justifications: ${missing.length} permission(s) requested but NOT ` +
            `justified: ${missing.join(', ')}`,
        );
      }
      if (orphan.length) {
        console.error(
          `check-permission-justifications: ${orphan.length} justification(s) for permission(s) ` +
            `the manifest does not request: ${orphan.join(', ')}`,
        );
      }
    }
    if (!ok) process.exitCode = 1;
    return result;
  } catch (err) {
    const result = {
      ok: false,
      error: err.message,
      manifestPermissions: [],
      justifiedPermissions: [],
      missing: [],
      orphan: [],
    };
    if (json) process.stdout.write(JSON.stringify(result));
    else console.error(`check-permission-justifications: ${err.message}`);
    process.exitCode = 1;
    return result;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
