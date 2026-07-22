import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const script = fileURLToPath(
  new URL('../../../../scripts/check-overlay-no-konva.mjs', import.meta.url),
);

/** Write an overlay.js/annotation.js fixture pair into a temp content dir and run the gate against it. */
function exitCodeFor(overlay: string, annotation: string | null): number {
  const dir = mkdtempSync(join(tmpdir(), 'bugcase-konva-'));
  writeFileSync(join(dir, 'overlay.js'), overlay);
  if (annotation !== null) {
    writeFileSync(join(dir, 'annotation.js'), annotation);
  }
  try {
    execFileSync('node', [script, 'chrome', dir], { stdio: 'pipe' });
    return 0;
  } catch (err) {
    return (err as { status?: number }).status ?? 1;
  }
}

describe('check-overlay-no-konva gate', () => {
  it('passes when overlay.js is Konva-free and annotation.js carries Konva', () => {
    expect(exitCodeFor('var overlay=1;', 'var Konva={};/* Konva warning */')).toBe(0);
  });

  it('fails when Konva leaked into overlay.js', () => {
    expect(exitCodeFor('var x=new Konva.Stage();', 'var Konva={};')).toBe(1);
  });

  it('fails when annotation.js does not contain Konva', () => {
    expect(exitCodeFor('var overlay=1;', 'var nothing=1;')).toBe(1);
  });

  it('fails when annotation.js is missing entirely', () => {
    expect(exitCodeFor('var overlay=1;', null)).toBe(1);
  });
});
