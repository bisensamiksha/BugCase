import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// hash-dist is a plain-node CLI; exercise it through the process (matches the other build-gate tests).
const script = fileURLToPath(new URL('../../scripts/hash-dist.mjs', import.meta.url));

function hashOf(target: string): string {
  return execFileSync('node', [script, target], { encoding: 'utf8' }).trim();
}

function makeDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'bugcase-hash-'));
  for (const [rel, contents] of Object.entries(files)) {
    const filePath = join(dir, rel);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
  return dir;
}

describe('hash-dist', () => {
  it('is a stable 64-char hex sha256', () => {
    const hash = hashOf(makeDir({ 'a.js': 'x' }));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic and independent of filesystem insertion order', () => {
    const a = hashOf(makeDir({ 'a.js': '1', 'nested/b.js': '2', 'c.txt': '3' }));
    const b = hashOf(makeDir({ 'c.txt': '3', 'nested/b.js': '2', 'a.js': '1' }));
    expect(a).toBe(b);
  });

  it('changes when any file content changes', () => {
    const before = hashOf(makeDir({ 'a.js': '1', 'b.js': '2' }));
    const after = hashOf(makeDir({ 'a.js': '1', 'b.js': 'CHANGED' }));
    expect(after).not.toBe(before);
  });

  it('changes when a file path changes but content is the same', () => {
    const before = hashOf(makeDir({ 'a.js': 'same' }));
    const after = hashOf(makeDir({ 'renamed.js': 'same' }));
    expect(after).not.toBe(before);
  });

  it('hashes a single file too', () => {
    const dir = makeDir({ 'only.js': 'hello' });
    expect(hashOf(join(dir, 'only.js'))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('exits non-zero when the target does not exist', () => {
    let code = 0;
    try {
      execFileSync('node', [script, join(tmpdir(), 'no-such-hash-target-xyz')], { stdio: 'pipe' });
    } catch (err) {
      code = (err as { status?: number }).status ?? 1;
    }
    expect(code).toBe(1);
  });
});
