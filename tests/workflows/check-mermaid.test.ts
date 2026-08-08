import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * S4-30: mermaid diagrams in committed docs must parse. A broken diagram renders as an error box on
 * GitHub and CI would otherwise stay green, so the failure is invisible until a reader hits it.
 *
 * Like the other build-gate scripts this is a plain-node CLI exercised through the real process, so
 * the untyped .mjs stays out of any tsc graph. `--json` makes the result machine-readable.
 */
const script = fileURLToPath(new URL('../../scripts/check-mermaid.mjs', import.meta.url));

interface CheckResult {
  ok: boolean;
  checked: number;
  failures: { file: string; block: number; message: string }[];
}

const GOOD = '```mermaid\nflowchart TD\n  a[Start] --> b[End]\n```\n';
// `flowchart` with a bare `-->` and no target is a syntax error, not a rendering quirk.
const BROKEN = '```mermaid\nflowchart TD\n  a[Start] -->\n```\n';

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'bugcase-mermaid-'));
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

describe('check-mermaid', () => {
  it('passes a valid diagram and counts it', () => {
    const { code, result } = run(fixture({ 'README.md': `# Doc\n\n${GOOD}` }));
    expect(code).toBe(0);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(1);
    expect(result.failures).toEqual([]);
  });

  it('fails a broken diagram and names the file and block', () => {
    const { code, result } = run(fixture({ 'README.md': `# Doc\n\n${BROKEN}` }));
    expect(code).toBe(1);
    expect(result.ok).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({ file: 'README.md', block: 1 });
    expect(result.failures[0]?.message).toBeTruthy();
  });

  it('numbers blocks within a file so the right one can be found', () => {
    const { result } = run(fixture({ 'ARCHITECTURE.md': `${GOOD}\ntext\n\n${BROKEN}` }));
    expect(result.checked).toBe(2);
    expect(result.failures.map((f) => f.block)).toEqual([2]);
  });

  it('reports every failure, not just the first', () => {
    const { result } = run(fixture({ 'README.md': BROKEN, 'ARCHITECTURE.md': BROKEN }));
    expect(result.failures.map((f) => f.file).sort()).toEqual(['ARCHITECTURE.md', 'README.md']);
  });

  it('ignores fenced code that is not mermaid', () => {
    const md = '```js\nconst a = 1;\n```\n\n```\nplain block\n```\n';
    const { code, result } = run(fixture({ 'README.md': md }));
    expect(code).toBe(0);
    expect(result.checked).toBe(0);
  });

  it('passes a tree with no markdown at all', () => {
    const { code, result } = run(fixture({ 'notes.txt': 'nothing here' }));
    expect(code).toBe(0);
    expect(result.checked).toBe(0);
  });

  // The gate itself. Everything above proves the script works; this proves the repo is clean.
  it('passes against the real repository tree', () => {
    const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
    const { code, result } = run(repoRoot);
    expect(result.failures).toEqual([]);
    expect(code).toBe(0);
    // Guards against the glob silently matching nothing, which would make this test vacuous.
    expect(result.checked).toBeGreaterThanOrEqual(4);
  });
});
