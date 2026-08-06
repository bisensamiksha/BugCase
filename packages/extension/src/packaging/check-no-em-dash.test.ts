import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// S4-36: user-visible content files (Markdown, HTML, SVG) must contain no em dash. ESLint covers UI
// source; this gate covers what ESLint cannot parse. Like the other build-gate scripts it is a
// plain-node CLI exercised through the real process, so the untyped .mjs stays out of the src/**
// tsc graph. --json makes the result machine-readable.
const script = fileURLToPath(new URL('../../../../scripts/check-no-em-dash.mjs', import.meta.url));

interface CheckResult {
  ok: boolean;
  hits: { file: string; line: number; text: string }[];
}

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'bugcase-emdash-'));
  for (const [name, body] of Object.entries(files)) {
    const full = join(dir, name);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body, 'utf8');
  }
  return dir;
}

function run(rootDir: string): { code: number | null; result: CheckResult } {
  const res = spawnSync('node', [script, rootDir, '--json'], { encoding: 'utf8' });
  return { code: res.status, result: JSON.parse(res.stdout) as CheckResult };
}

describe('check-no-em-dash', () => {
  it('reports the file and 1-indexed line of each em dash, and fails', () => {
    const { code, result } = run(fixture({ 'README.md': 'clean line\nbad — line\n' }));
    expect(code).toBe(1);
    expect(result.ok).toBe(false);
    expect(result.hits).toEqual([{ file: 'README.md', line: 2, text: 'bad — line' }]);
  });

  it('passes on a clean tree', () => {
    const { code, result } = run(fixture({ 'README.md': 'all clean\n' }));
    expect(code).toBe(0);
    expect(result).toEqual({ ok: true, hits: [] });
  });

  it('reports every hit, not just the first', () => {
    const { result } = run(fixture({ 'README.md': 'x — y\n', 'CONTRIBUTING.md': 'p — q\n' }));
    expect(result.hits).toHaveLength(2);
  });

  it('does not flag en dashes or hyphens', () => {
    const { code, result } = run(fixture({ 'README.md': 'range 1–2 and hyphen-word\n' }));
    expect(code).toBe(0);
    expect(result.hits).toEqual([]);
  });

  it('scans nested store and design paths', () => {
    const { result } = run(
      fixture({
        'store/shared/listing-copy.md': 'name — here\n',
        'design/promo.svg': '<svg aria-label="BugCase — x" />\n',
      }),
    );
    expect(result.hits.map((h) => h.file).sort()).toEqual([
      'design/promo.svg',
      'store/shared/listing-copy.md',
    ]);
  });

  it('passes against the real repository tree', () => {
    const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
    const { code } = run(repoRoot);
    expect(code).toBe(0);
  });
});
