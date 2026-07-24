import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Both scripts are plain-node CLIs; exercise the verifier through the real process (via --json) so the
// untyped .mjs stays out of the src/** tsc graph — matches package-chrome.test.ts. zip-extension.mjs
// zips a temp dir verbatim (no validation), so we can synthesize deliberately-broken artifacts without
// depending on jszip in this package.
const verifyScript = fileURLToPath(
  new URL('../../../../scripts/verify-edge-brave-artifacts.mjs', import.meta.url),
);
const zipScript = fileURLToPath(new URL('../../../../scripts/zip-extension.mjs', import.meta.url));

// The manifest version must equal the extension package version; read that source of truth so the
// happy-path fixture tracks the version bump instead of hard-coding a number that would drift.
const extensionVersion = (
  JSON.parse(
    readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
  ) as { version: string }
).version;

type Manifest = Record<string, unknown>;

function validManifest(overrides: Manifest = {}): Manifest {
  return {
    manifest_version: 3,
    name: 'Bug Reporter Tool',
    short_name: 'BugCase',
    description: 'Privacy-first bug report capture. No backend, no telemetry.',
    version: extensionVersion,
    action: { default_popup: 'src/popup/popup.html', default_title: 'Capture bug report' },
    icons: { '16': 'public/icons/icon-16.png', '128': 'public/icons/icon-128.png' },
    background: { service_worker: 'service-worker-loader.js', type: 'module' },
    ...overrides,
  };
}

/** Write a temp dir (manifest + declared files + extras), zip it verbatim, return the zip path. */
function makeArtifact(
  manifest: Manifest,
  extraFiles: Record<string, string> = {},
  {
    writeIcons = true,
    writeServiceWorker = true,
  }: { writeIcons?: boolean; writeServiceWorker?: boolean } = {},
): string {
  const root = mkdtempSync(join(tmpdir(), 'bugcase-verify-'));
  const srcDir = join(root, 'dist-chrome');
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(join(srcDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const icons = manifest.icons;
  if (writeIcons && icons && typeof icons === 'object') {
    for (const rel of Object.values(icons as Record<string, string>)) {
      const p = join(srcDir, rel);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, 'PNG');
    }
  }
  const sw = (manifest.background as { service_worker?: string } | undefined)?.service_worker;
  if (writeServiceWorker && typeof sw === 'string') {
    const p = join(srcDir, sw);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, 'self.addEventListener("install",()=>{});');
  }
  for (const [rel, contents] of Object.entries(extraFiles)) {
    const p = join(srcDir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, contents);
  }

  const outZip = join(root, 'artifact.zip');
  const zipRes = spawnSync('node', [zipScript, srcDir, outZip], { encoding: 'utf8' });
  if (zipRes.status !== 0) throw new Error(`zip failed: ${zipRes.stderr}`);
  return outZip;
}

interface VerifyResult {
  ok: boolean;
  version?: string;
  artifact?: string;
  sha256?: string;
  errors?: string[];
  checks?: string[];
}

function runVerify(zipPath: string): { code: number | null; result: VerifyResult } {
  const res = spawnSync('node', [verifyScript, '--json', '--zip', zipPath], { encoding: 'utf8' });
  return { code: res.status, result: JSON.parse(res.stdout) as VerifyResult };
}

describe('verify-edge-brave-artifacts gate', () => {
  it('accepts a valid Chromium artifact and reports its sha256', () => {
    const { code, result } = runVerify(makeArtifact(validManifest()));
    expect(code).toBe(0);
    expect(result.ok).toBe(true);
    expect(result.version).toBe(extensionVersion);
    expect(result.artifact).toMatch(/\.zip$/);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('fails when background.service_worker is missing from the manifest', () => {
    const { code, result } = runVerify(
      makeArtifact(validManifest({ background: { type: 'module' } })),
    );
    expect(code).toBe(1);
    expect(result.ok).toBe(false);
    expect((result.errors ?? []).join(' ')).toMatch(/service_worker/i);
  });

  it('fails when the declared service worker file is absent from the archive', () => {
    const { code, result } = runVerify(
      makeArtifact(validManifest(), {}, { writeServiceWorker: false }),
    );
    expect(code).toBe(1);
    expect((result.errors ?? []).join(' ')).toMatch(/service_worker.*missing|missing.*archive/i);
  });

  it('fails when the manifest version does not match the extension package version', () => {
    const { code, result } = runVerify(makeArtifact(validManifest({ version: '0.0.0-wrong' })));
    expect(code).toBe(1);
    expect((result.errors ?? []).join(' ')).toMatch(/version/i);
  });

  it('fails when a Firefox-only key (browser_specific_settings) leaks in', () => {
    const { code, result } = runVerify(
      makeArtifact(validManifest({ browser_specific_settings: { gecko: { id: 'bugcase@x' } } })),
    );
    expect(code).toBe(1);
    expect((result.errors ?? []).join(' ')).toMatch(/browser_specific_settings/i);
  });

  it('fails when a sourcemap ships in the archive', () => {
    const { code, result } = runVerify(
      makeArtifact(validManifest(), { 'assets/app.js.map': '{"version":3}' }),
    );
    expect(code).toBe(1);
    expect((result.errors ?? []).join(' ')).toMatch(/sourcemap|\.map/i);
  });

  it('fails cleanly when the artifact does not exist', () => {
    const { code, result } = runVerify(join(tmpdir(), 'no-such-artifact-xyz-123.zip'));
    expect(code).toBe(1);
    expect(result.ok).toBe(false);
    expect((result.errors ?? []).join(' ')).toMatch(/not found|package:chrome/i);
  });
});
