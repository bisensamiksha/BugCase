import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { zipDirectory } from './zip-extension.mjs';

// S4-18: turn a production `dist-chrome` build into the store-upload ZIP.
//
// The Chrome gate is a purpose-built, Chrome-aware validator — NOT `web-ext lint`, which is Mozilla's
// AMO linter and false-errors on a valid Chrome MV3 manifest (it flags `background.service_worker` as
// "unsupported" and demands a gecko extension id). `web-ext lint` stays the Firefox gate
// (`lint:firefox-manifest`). See packages/extension/PACKAGING.md.
//
// "Signed ZIP" = the upload-ready archive; the Chrome Web Store signs it server-side on upload, so no
// private key is generated or committed. Sourcemaps are kept on disk for debugging but excluded from
// the upload.

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_DIST = path.join(REPO_ROOT, 'packages/extension/dist-chrome');
const DEFAULT_OUT = path.join(REPO_ROOT, 'dist');
const EXTENSION_PKG = path.join(REPO_ROOT, 'packages/extension/package.json');

/** Sourcemaps: shipped in the on-disk build for debugging, kept out of the store upload. */
export function isSourcemap(posixRelPath) {
  return posixRelPath.endsWith('.map');
}

/**
 * Validate a built Chrome MV3 manifest against the fields Chrome requires and the versioning
 * guardrail (the manifest version must equal the extension's package version). Pure.
 *
 * @param {unknown} manifest Parsed `manifest.json`.
 * @param {string} expectedVersion The extension `package.json` version.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateChromeManifest(manifest, expectedVersion) {
  const errors = [];
  const m = manifest && typeof manifest === 'object' ? manifest : {};

  if (m.manifest_version !== 3) {
    errors.push(`manifest_version must be 3 for a Chrome MV3 package (got ${JSON.stringify(m.manifest_version)})`);
  }
  if (typeof m.version !== 'string') {
    errors.push('version is missing or not a string');
  } else if (m.version !== expectedVersion) {
    errors.push(
      `version "${m.version}" does not match the extension package version "${expectedVersion}" — ` +
        'the manifest version must come from package metadata (do not hand-edit it)',
    );
  }
  if (typeof m.name !== 'string' || m.name.length === 0) errors.push('name is missing');
  if (typeof m.description !== 'string' || m.description.length === 0) {
    errors.push('description is missing');
  }
  if (m.action === null || typeof m.action !== 'object') errors.push('action is missing');
  if (m.icons === null || typeof m.icons !== 'object' || Object.keys(m.icons ?? {}).length === 0) {
    errors.push('icons is missing');
  }
  const serviceWorker = m.background?.service_worker;
  if (typeof serviceWorker !== 'string' || serviceWorker.length === 0) {
    errors.push('background.service_worker is missing (Chrome MV3 uses a service worker, not scripts)');
  }
  // Firefox-only keys must not leak into a Chrome package.
  if ('browser_specific_settings' in m) {
    errors.push('browser_specific_settings is a Firefox-only key and must not appear in a Chrome build');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Return the declared icon paths that are absent, given a `hasFile(posixRelPath) => boolean` predicate.
 * Pure.
 */
export function missingIconPaths(manifest, hasFile) {
  const icons = manifest?.icons;
  if (icons === null || typeof icons !== 'object') return [];
  return Object.values(icons).filter((rel) => typeof rel === 'string' && !hasFile(rel));
}

/** Raised for an expected packaging failure so `main` can report it and exit 1 (no uncaught throw). */
export class PackageError extends Error {
  constructor(errors) {
    super(errors.join('; '));
    this.name = 'PackageError';
    this.errors = errors;
  }
}

/**
 * Build the store-upload ZIP from a production Chrome build.
 *
 * @param {{ distDir: string, outDir: string, expectedVersion: string }} options
 * @returns {Promise<{ ok: true, version: string, outFile: string, entries: number, bytes: number,
 *   includedPaths: string[], excludedSourcemaps: number }>}
 * @throws {PackageError} when the build is missing, the manifest is invalid, or an icon is absent.
 */
export async function packageChrome({ distDir, outDir, expectedVersion }) {
  let isDir = false;
  try {
    isDir = (await stat(distDir)).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) {
    throw new PackageError([`build output not found: ${distDir} — run the Chrome build first`]);
  }

  const manifestPath = path.join(distDir, 'manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (err) {
    throw new PackageError([`could not read manifest.json in ${distDir}: ${err.message}`]);
  }

  const { ok, errors } = validateChromeManifest(manifest, expectedVersion);
  if (!ok) throw new PackageError(errors);

  const missing = missingIconPaths(manifest, (rel) => existsSync(path.join(distDir, rel)));
  if (missing.length > 0) {
    throw new PackageError(missing.map((rel) => `declared icon missing from the build: ${rel}`));
  }

  const version = manifest.version;
  const outFile = path.join(outDir, `bugcase-chrome-${version}.zip`);
  // The filter drops only sourcemaps, so zipDirectory's `excluded` count is the sourcemap count.
  const result = await zipDirectory(distDir, outFile, { filter: (rel) => !isSourcemap(rel) });

  return {
    ok: true,
    version,
    outFile: result.outFile,
    entries: result.entries,
    bytes: result.bytes,
    includedPaths: result.paths,
    excludedSourcemaps: result.excluded,
  };
}

async function readExtensionVersion() {
  const pkg = JSON.parse(await readFile(EXTENSION_PKG, 'utf8'));
  return pkg.version;
}

export async function main(argv = process.argv.slice(2)) {
  const args = argv.filter((a) => a !== '--json');
  const json = argv.includes('--json');
  const distDir = args[0] ? path.resolve(args[0]) : DEFAULT_DIST;
  const outDir = args[1] ? path.resolve(args[1]) : DEFAULT_OUT;

  try {
    const expectedVersion = await readExtensionVersion();
    const result = await packageChrome({ distDir, outDir, expectedVersion });
    if (json) {
      process.stdout.write(JSON.stringify(result));
    } else {
      console.log(`package-chrome: validated manifest v${result.version} (Chrome MV3)`);
      console.log(
        `package-chrome: wrote ${result.outFile} (${result.entries} entries, ${result.bytes} bytes; ` +
          `excluded ${result.excludedSourcemaps} sourcemap(s))`,
      );
    }
    return result;
  } catch (err) {
    const errors = err instanceof PackageError ? err.errors : [err.message];
    if (json) {
      process.stdout.write(JSON.stringify({ ok: false, errors }));
    } else {
      for (const e of errors) console.error(`package-chrome: ${e}`);
    }
    process.exitCode = 1;
    return { ok: false, errors };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
