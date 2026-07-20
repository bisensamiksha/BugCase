import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const script = fileURLToPath(
  new URL('../../../scripts/check-report-html-size.mjs', import.meta.url),
);
const MAX = 5 * 1024 * 1024;

/** Run the gate against a fixture of exactly `bytes` bytes; return the process exit code. */
function exitCodeFor(bytes: number): number {
  const dir = mkdtempSync(join(tmpdir(), 'bugcase-size-'));
  const file = join(dir, 'report.html');
  writeFileSync(file, Buffer.alloc(bytes, 0x61));
  try {
    execFileSync('node', [script, file], { stdio: 'pipe' });
    return 0;
  } catch (err) {
    return (err as { status?: number }).status ?? 1;
  }
}

describe('check-report-html-size gate', () => {
  it('passes just under the 5 MiB budget', () => {
    expect(exitCodeFor(MAX - 1)).toBe(0);
  });

  it('fails at the 5 MiB budget', () => {
    expect(exitCodeFor(MAX)).toBe(1);
  });
});
