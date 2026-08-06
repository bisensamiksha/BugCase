import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// The Chrome packaging gate is a plain-node CLI (like scripts/check-overlay-no-konva.mjs); exercise it
// through the real process so the untyped .mjs stays out of the src/** tsc graph (matches the other
// build-gate tests). --json makes its result machine-readable for these assertions (and for S4-19 CI).
const script = fileURLToPath(new URL('../../../../scripts/package-chrome.mjs', import.meta.url));

// The manifest version must equal the extension's package version (the versioning guardrail), so the
// happy-path fixture reads that same source of truth instead of hard-coding a number that would drift.
const extensionVersion = (
  JSON.parse(
    readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
  ) as { version: string }
).version;

type Manifest = Record<string, unknown>;

function validManifest(overrides: Manifest = {}): Manifest {
  return {
    manifest_version: 3,
    name: 'BugCase - Bug Reporter Tool',
    short_name: 'BugCase',
    description: 'Privacy-first bug report capture. No backend, no telemetry.',
    version: extensionVersion,
    action: { default_popup: 'src/popup/popup.html', default_title: 'Capture bug report' },
    icons: {
      '16': 'public/icons/icon-16.png',
      '128': 'public/icons/icon-128.png',
    },
    background: { service_worker: 'service-worker-loader.js', type: 'module' },
    ...overrides,
  };
}

interface Dist {
  distDir: string;
  outDir: string;
}

/** Materialize a temp dist-chrome dir: the manifest, its declared icon files (unless writeIcons=false),
 *  and any extra files. */
function makeDist(
  manifest: Manifest,
  extraFiles: Record<string, string> = {},
  { writeIcons = true }: { writeIcons?: boolean } = {},
): Dist {
  const root = mkdtempSync(join(tmpdir(), 'bugcase-pkg-'));
  const distDir = join(root, 'dist-chrome');
  const outDir = join(root, 'out');
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const icons = manifest.icons;
  if (writeIcons && icons && typeof icons === 'object') {
    for (const rel of Object.values(icons as Record<string, string>)) {
      const iconPath = join(distDir, rel);
      mkdirSync(dirname(iconPath), { recursive: true });
      writeFileSync(iconPath, 'PNG');
    }
  }
  for (const [rel, contents] of Object.entries(extraFiles)) {
    const filePath = join(distDir, rel);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
  return { distDir, outDir };
}

interface PackageResult {
  ok: boolean;
  errors?: string[];
  version?: string;
  outFile?: string;
  includedPaths?: string[];
  entries?: number;
  bytes?: number;
  excludedSourcemaps?: number;
}

function runPackage(
  distDir: string,
  outDir: string,
): { code: number | null; result: PackageResult } {
  const res = spawnSync('node', [script, distDir, outDir, '--json'], { encoding: 'utf8' });
  return { code: res.status, result: JSON.parse(res.stdout) as PackageResult };
}

describe('package-chrome gate', () => {
  it('packages a valid Chrome build into a versioned zip, excluding sourcemaps', () => {
    const { distDir, outDir } = makeDist(validManifest(), {
      'assets/app.js': 'console.log(1)',
      'assets/app.js.map': '{"version":3}',
    });
    const { code, result } = runPackage(distDir, outDir);
    expect(code).toBe(0);
    expect(result.ok).toBe(true);
    expect(result.version).toBe(extensionVersion);
    expect(result.outFile).toMatch(
      new RegExp(`bugcase-chrome-${extensionVersion.replace(/\./g, '\\.')}\\.zip$`),
    );
    expect(existsSync(result.outFile as string)).toBe(true);
    expect(result.includedPaths).toContain('manifest.json');
    expect(result.includedPaths).toContain('assets/app.js');
    expect(result.includedPaths).not.toContain('assets/app.js.map');
    expect(result.excludedSourcemaps).toBe(1);
  });

  it('fails when the manifest version does not match the package version', () => {
    const { distDir, outDir } = makeDist(validManifest({ version: '0.0.0-wrong' }));
    const { code, result } = runPackage(distDir, outDir);
    expect(code).toBe(1);
    expect(result.ok).toBe(false);
    expect((result.errors ?? []).join(' ')).toMatch(/version/i);
  });

  it('fails when manifest_version is not 3', () => {
    const { distDir, outDir } = makeDist(validManifest({ manifest_version: 2 }));
    const { code, result } = runPackage(distDir, outDir);
    expect(code).toBe(1);
    expect((result.errors ?? []).join(' ')).toMatch(/manifest_version/i);
  });

  it('fails when background.service_worker is missing (Chrome MV3 shape)', () => {
    const { distDir, outDir } = makeDist(validManifest({ background: { type: 'module' } }));
    const { code, result } = runPackage(distDir, outDir);
    expect(code).toBe(1);
    expect((result.errors ?? []).join(' ')).toMatch(/service_worker/i);
  });

  it('fails when a Firefox-only key (browser_specific_settings) leaks into the Chrome build', () => {
    const { distDir, outDir } = makeDist(
      validManifest({ browser_specific_settings: { gecko: { id: 'bugcase@x' } } }),
    );
    const { code, result } = runPackage(distDir, outDir);
    expect(code).toBe(1);
    expect((result.errors ?? []).join(' ')).toMatch(/browser_specific_settings/i);
  });

  it('fails when a declared icon file is missing from the build', () => {
    const { distDir, outDir } = makeDist(validManifest(), {}, { writeIcons: false });
    const { code, result } = runPackage(distDir, outDir);
    expect(code).toBe(1);
    expect((result.errors ?? []).join(' ')).toMatch(/icon/i);
  });

  it('fails cleanly when the build output does not exist', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'bugcase-out-'));
    const { code, result } = runPackage(join(tmpdir(), 'no-such-dist-xyz-123'), outDir);
    expect(code).toBe(1);
    expect(result.ok).toBe(false);
    expect((result.errors ?? []).join(' ')).toMatch(/build|not found|dist/i);
  });

  it('fails cleanly when manifest.json is malformed', () => {
    const root = mkdtempSync(join(tmpdir(), 'bugcase-pkg-'));
    const distDir = join(root, 'dist-chrome');
    mkdirSync(distDir, { recursive: true });
    writeFileSync(join(distDir, 'manifest.json'), '{ not valid json');
    const { code, result } = runPackage(distDir, join(root, 'out'));
    expect(code).toBe(1);
    expect((result.errors ?? []).join(' ')).toMatch(/manifest/i);
  });
});
