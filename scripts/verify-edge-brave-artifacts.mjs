import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import JSZip from 'jszip';

import { hashDist } from './hash-dist.mjs';
import { isSourcemap, missingIconPaths, validateChromeManifest } from './package-chrome.mjs';

// S4-24: pre-submission sanity check that the ONE Chromium ZIP (dist/bugcase-chrome-<version>.zip, S4-18)
// is safe to upload to the Chromium siblings — Edge and Brave install the same package as Chrome, with no
// separate build. So "verify Edge/Brave" = a valid Chrome MV3 manifest + a clean ZIP layout + nothing
// Firefox-only leaked in. Manifest validity is reused from package-chrome (the S4-18 gate).

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_OUT = path.join(REPO_ROOT, 'dist');
const EXTENSION_PKG = path.join(REPO_ROOT, 'packages/extension/package.json');

/**
 * Verify a packaged Chrome MV3 artifact installs cleanly on the Chromium siblings (Edge, Brave). Pure.
 *
 * @param {unknown} manifest Parsed manifest.json from the archive.
 * @param {string[]} zipEntryPaths POSIX-relative file paths present in the archive.
 * @param {string} expectedVersion The extension package.json version.
 * @returns {{ ok: boolean, errors: string[], checks: string[] }}
 */
export function verifyEdgeBraveArtifact(manifest, zipEntryPaths, expectedVersion) {
  const errors = [];
  const checks = [];
  const entries = new Set(zipEntryPaths);
  const m = manifest && typeof manifest === 'object' ? manifest : {};

  // 1. Valid Chrome MV3 manifest (also rejects the Firefox gecko key + version mismatch). S4-18 reuse.
  const { ok: manifestOk, errors: manifestErrors } = validateChromeManifest(manifest, expectedVersion);
  if (manifestOk) checks.push(`manifest is a valid Chrome MV3 package (v${expectedVersion})`);
  else errors.push(...manifestErrors);

  // 2. manifest.json at the archive root.
  if (entries.has('manifest.json')) checks.push('manifest.json present at archive root');
  else errors.push('manifest.json is not at the archive root');

  // 3. The declared service worker file is in the archive.
  const sw = m.background?.service_worker;
  if (typeof sw === 'string' && sw.length > 0) {
    if (entries.has(sw)) checks.push(`service worker present: ${sw}`);
    else errors.push(`background.service_worker "${sw}" is declared but missing from the archive`);
  }

  // 4. Declared icons are in the archive.
  const missingIcons = missingIconPaths(m, (rel) => entries.has(rel));
  if (missingIcons.length > 0) {
    errors.push(...missingIcons.map((rel) => `declared icon missing from the archive: ${rel}`));
  } else if (m.icons && typeof m.icons === 'object') {
    checks.push('all declared icons present in the archive');
  }

  // 5. No sourcemaps in the upload (the store ZIP excludes them; reassert so a regression is caught).
  const maps = zipEntryPaths.filter((p) => isSourcemap(p));
  if (maps.length > 0) errors.push(`sourcemaps must not ship in the upload: ${maps.join(', ')}`);
  else checks.push('no .map sourcemaps in the archive');

  return { ok: errors.length === 0, errors, checks };
}

async function readExtensionVersion() {
  const pkg = JSON.parse(await readFile(EXTENSION_PKG, 'utf8'));
  return pkg.version;
}

/** Parse [--json] [--zip <path>]. */
function parseArgs(argv) {
  const json = argv.includes('--json');
  const i = argv.indexOf('--zip');
  const zipArg = i !== -1 ? argv[i + 1] : undefined;
  return { json, zipArg };
}

export async function main(argv = process.argv.slice(2)) {
  const { json, zipArg } = parseArgs(argv);
  try {
    const expectedVersion = await readExtensionVersion();
    const zipPath = zipArg
      ? path.resolve(zipArg)
      : path.join(DEFAULT_OUT, `bugcase-chrome-${expectedVersion}.zip`);

    if (!existsSync(zipPath)) {
      throw new Error(`artifact not found: ${zipPath} — run \`pnpm package:chrome\` first`);
    }

    const zip = await JSZip.loadAsync(await readFile(zipPath));
    const zipEntryPaths = Object.values(zip.files)
      .filter((f) => !f.dir)
      .map((f) => f.name);

    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
      throw new Error(
        'manifest.json not found at the archive root — not an installable extension package',
      );
    }
    let manifest;
    try {
      manifest = JSON.parse(await manifestFile.async('string'));
    } catch (err) {
      throw new Error(`could not parse manifest.json in the archive: ${err.message}`);
    }

    const { ok, errors, checks } = verifyEdgeBraveArtifact(manifest, zipEntryPaths, expectedVersion);
    const sha256 = await hashDist(zipPath);
    const result = {
      ok,
      version: expectedVersion,
      artifact: path.basename(zipPath),
      sha256,
      errors,
      checks,
    };

    if (json) {
      process.stdout.write(JSON.stringify(result));
    } else if (ok) {
      console.log(`verify-edge-brave: ${result.artifact} is OK for Edge/Brave (Chromium siblings)`);
      for (const c of checks) console.log(`  ✓ ${c}`);
      console.log(`  sha256: ${sha256}`);
    } else {
      for (const e of errors) console.error(`verify-edge-brave: ${e}`);
    }
    if (!ok) process.exitCode = 1;
    return result;
  } catch (err) {
    if (json) process.stdout.write(JSON.stringify({ ok: false, errors: [err.message] }));
    else console.error(`verify-edge-brave: ${err.message}`);
    process.exitCode = 1;
    return { ok: false, errors: [err.message] };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
