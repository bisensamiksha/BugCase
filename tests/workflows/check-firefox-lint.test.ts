import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Contract tests for the Firefox parity ratchet (S4-29).
 *
 * The script normally shells out to `web-ext lint`, which needs a built `dist-firefox` and takes
 * seconds. `--report` injects a pre-captured lint JSON instead, so these tests exercise the
 * ratchet logic — the part that can regress — without a build. CI runs the real thing.
 */
const script = fileURLToPath(new URL('../../scripts/check-firefox-lint.mjs', import.meta.url));
const baselineFile = fileURLToPath(
  new URL('../../scripts/firefox-lint-baseline.json', import.meta.url),
);

interface Message {
  code: string;
  message: string;
  file?: string;
}

function lintReport(errors: Message[], warnings: Message[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'bugcase-fxlint-'));
  const file = join(dir, 'report.json');
  writeFileSync(file, JSON.stringify({ errors, warnings, notices: [] }));
  return file;
}

function warn(code: string, n: number): Message[] {
  return Array.from({ length: n }, (_, i) => ({
    code,
    message: `${code} occurrence ${i + 1}`,
    file: `bundle-${i}.js`,
  }));
}

function baselineOf(warnings: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'bugcase-fxbase-'));
  const file = join(dir, 'baseline.json');
  writeFileSync(file, JSON.stringify({ warnings }));
  return file;
}

/** Runs the ratchet and returns its exit code plus combined output. */
function run(reportPath: string, baselinePath: string): { code: number; output: string } {
  try {
    const output = execFileSync(
      'node',
      [script, '--report', reportPath, '--baseline', baselinePath],
      { encoding: 'utf8', stdio: 'pipe' },
    );
    return { code: 0, output };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

describe('check-firefox-lint', () => {
  it('passes when warnings sit exactly at the baseline', () => {
    const { code, output } = run(lintReport([], warn('UNSAFE_VAR_ASSIGNMENT', 8)), baselineOf(8));
    expect(code).toBe(0);
    expect(output).toContain('errors: 0');
    expect(output).toContain('warnings: 8');
  });

  it('fails on any lint error, even with warnings under the baseline', () => {
    const errors = [
      { code: 'MANIFEST_FIELD_INVALID', message: 'bad manifest', file: 'manifest.json' },
    ];
    const { code, output } = run(lintReport(errors, warn('DANGEROUS_EVAL', 1)), baselineOf(8));
    expect(code).toBe(1);
    expect(output).toContain('MANIFEST_FIELD_INVALID');
  });

  it('fails when warnings exceed the baseline', () => {
    const { code } = run(lintReport([], warn('UNSAFE_VAR_ASSIGNMENT', 9)), baselineOf(8));
    expect(code).toBe(1);
  });

  it('names the offending rule and file when it fails, so a red build is actionable', () => {
    const warnings = [...warn('UNSAFE_VAR_ASSIGNMENT', 8), ...warn('DANGEROUS_EVAL', 1)];
    const { output } = run(lintReport([], warnings), baselineOf(8));
    expect(output).toContain('UNSAFE_VAR_ASSIGNMENT');
    expect(output).toContain('DANGEROUS_EVAL');
    expect(output).toMatch(/bundle-0\.js/);
  });

  it('passes below the baseline and advises lowering it, so the ratchet only tightens', () => {
    const { code, output } = run(lintReport([], warn('DANGEROUS_EVAL', 3)), baselineOf(8));
    expect(code).toBe(0);
    expect(output.toLowerCase()).toContain('lower the baseline');
  });

  it('ships a committed baseline that is a plain non-negative warning count', () => {
    const parsed: unknown = JSON.parse(readFileSync(baselineFile, 'utf8'));
    expect(typeof parsed).toBe('object');

    const { warnings } = parsed as { warnings: unknown };
    expect(typeof warnings).toBe('number');
    expect(Number.isInteger(warnings)).toBe(true);
    expect(warnings as number).toBeGreaterThanOrEqual(0);
  });

  it('refuses a malformed lint report rather than passing it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bugcase-fxlint-bad-'));
    const file = join(dir, 'report.json');
    writeFileSync(file, 'not json at all');
    expect(run(file, baselineOf(8)).code).toBe(1);
  });
});
